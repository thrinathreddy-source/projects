"""
The HTTP surface. One process, one port, one thing to start.

Audio comes in either as a multipart file field (what a browser MediaRecorder
produces) or base64 in JSON (what an embedded client finds easier). Audio goes
out as base64 inside the JSON response, so a single round trip carries the text
and the speech together — on a bad rural connection, two requests is one too
many.
"""

from __future__ import annotations

import base64
import logging
import os
import tomllib
from pathlib import Path

from flask import Flask, jsonify, request

from . import languages as L
from .backends import (Bhashini, BackendError, LocalAnswerer, NllbTranslator,
                       PiperTts, TesseractOcr, WhisperAsr)
from .display import PANEL, Renderer, available_scripts
from .pipeline import Pipeline, Unsupported

log = logging.getLogger("drishti")

DEFAULTS = {
    "server": {"host": "0.0.0.0", "port": 8080},
    "tts": {"voices_dir": "../piper-voices", "max_loaded_voices": 3},
    "asr": {"model": "small", "compute_type": "int8"},
    "translate": {"model": "facebook/nllb-200-distilled-600M"},
    "answer": {"url": "", "model": ""},
    "cloud": {"bhashini_user_id": "", "bhashini_api_key": ""},
}


def load_config(path: str | None = None) -> dict:
    cfg = {k: dict(v) for k, v in DEFAULTS.items()}
    p = Path(path or os.environ.get("DRISHTI_CONFIG", "config.toml"))
    if p.is_file():
        with p.open("rb") as fh:
            for section, values in tomllib.load(fh).items():
                cfg.setdefault(section, {}).update(values)
        log.info("config loaded from %s", p)
    else:
        log.warning("no config at %s — using defaults", p)

    # Environment always wins, so a deployment can override without editing files.
    if v := os.environ.get("DRISHTI_ANSWER_URL"):
        cfg["answer"]["url"] = v
    if v := os.environ.get("BHASHINI_USER_ID"):
        cfg["cloud"]["bhashini_user_id"] = v
    if v := os.environ.get("BHASHINI_API_KEY"):
        cfg["cloud"]["bhashini_api_key"] = v
    return cfg


def build_pipeline(cfg: dict) -> Pipeline:
    base = Path(__file__).resolve().parent.parent
    voices = (base / cfg["tts"]["voices_dir"]).resolve()
    return Pipeline(
        tts=PiperTts(str(voices), int(cfg["tts"]["max_loaded_voices"])),
        asr=WhisperAsr(cfg["asr"]["model"], cfg["asr"]["compute_type"]),
        mt=NllbTranslator(cfg["translate"]["model"]),
        cloud=Bhashini(cfg["cloud"]["bhashini_user_id"], cfg["cloud"]["bhashini_api_key"]),
        answerer=LocalAnswerer(cfg["answer"]["url"], cfg["answer"]["model"]),
        ocr=TesseractOcr(),
        renderer=Renderer(),
    )


def _audio_from_request() -> bytes:
    """Accept multipart 'audio' or JSON {'audio_base64': ...}."""
    if "audio" in request.files:
        return request.files["audio"].read()
    body = request.get_json(silent=True) or {}
    if b64 := body.get("audio_base64"):
        return base64.b64decode(b64)
    raise Unsupported("no audio in request",
                      remedy="Send multipart field 'audio' or JSON 'audio_base64'.")


def _field(name: str, default=None):
    if request.files and name in request.form:
        return request.form[name]
    body = request.get_json(silent=True) or {}
    return body.get(name, request.args.get(name, default))


def _respond(result, extra_keys=()):
    payload = {"ok": True, "via": result.via, "degraded": result.degraded}
    for k, v in result.data.items():
        if k == "audio":
            payload["audio_base64"] = base64.b64encode(v).decode()
            payload["audio_format"] = "wav"
        elif k == "display":
            if v:
                frame = v.pop("frame")
                v["png_base64"] = base64.b64encode(frame.to_png_bytes()).decode()
                payload["display"] = v
        elif k in extra_keys or extra_keys == ():
            payload[k] = v
    return jsonify(payload)


def create_app(config_path: str | None = None) -> Flask:
    cfg = load_config(config_path)
    app = Flask(__name__)
    app.config["DRISHTI"] = cfg
    pipe = build_pipeline(cfg)
    app.config["PIPELINE"] = pipe

    @app.after_request
    def _cors(resp):
        # The companion app is served from a different port (Expo on :8081) and
        # in production from a phone, so every real caller is cross-origin.
        # This gateway is meant to run on the user's own device or their own
        # hub on a home/personal network — it holds no accounts and no secrets
        # to steal, so a permissive origin here costs nothing. If you ever put
        # it on the open internet, put a real reverse proxy in front of it.
        resp.headers.setdefault("Access-Control-Allow-Origin", "*")
        resp.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
        resp.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        return resp

    @app.route("/v1/<path:_any>", methods=["OPTIONS"])
    def _preflight(_any):
        return ("", 204)

    @app.errorhandler(Unsupported)
    def _unsupported(e: Unsupported):
        # 200, not 5xx: this is a known limit being reported honestly, not a
        # crash. The app shows `message` to the person and `remedy` to whoever
        # set the box up.
        return jsonify({"ok": False, "code": e.code,
                        "error": e.message, "remedy": e.remedy}), 200

    @app.errorhandler(BackendError)
    def _backend(e: BackendError):
        log.exception("backend failure")
        return jsonify({"ok": False, "error": "Something went wrong. Please try again.",
                        "detail": str(e)}), 503

    @app.get("/v1/health")
    def health():
        caps = pipe.capabilities()
        usable = [c for c, d in caps["languages"].items()
                  if d["speak"]["available"] and d["listen"]["available"]]
        backends = dict(caps["backends"])
        scripts = available_scripts()
        backends["display"] = all(scripts.values())
        return jsonify({"ok": True, "status": "up" if usable else "degraded",
                        "usable_languages": usable, "backends": backends,
                        "display": {"panel": [PANEL.width, PANEL.height],
                                    "scripts": scripts}})

    @app.get("/v1/languages")
    def languages():
        return jsonify({"ok": True, "languages": pipe.capabilities()["languages"]})

    @app.post("/v1/speak")
    def speak():
        text, lang = _field("text", ""), _field("lang", "en")
        if not text:
            raise Unsupported("nothing to say")
        return _respond(pipe.speak(text, lang))

    @app.post("/v1/listen")
    def listen():
        return _respond(pipe.listen(_audio_from_request(), _field("lang")))

    @app.post("/v1/translate")
    def translate():
        text = _field("text", "")
        if not text:
            raise Unsupported("nothing to translate")
        return _respond(pipe.translate(text, _field("from", "en"), _field("to", "hi")))

    # -- the three features ---------------------------------------------------

    @app.post("/v1/ask")
    def ask():
        lang = _field("lang", "hi")
        text = _field("text")
        audio = None if text else _audio_from_request()
        return _respond(pipe.ask(audio, text, lang))

    @app.post("/v1/understand")
    def understand():
        return _respond(pipe.understand(_audio_from_request(),
                                        _field("from", "en"), _field("to", "hi")))

    @app.post("/v1/display")
    def display():
        """
        Render arbitrary text for the panel without going through a feature.

        Used by the app to preview a wearer's view, and by firmware work to pull
        real packets to blit. `format=packets` returns the BLE frames as base64
        so an embedded client can push them straight out.
        """
        text, lang = _field("text", ""), _field("lang", "en")
        if not text:
            raise Unsupported("nothing to display", code="didnt_catch")
        page = int(_field("page", 0) or 0)

        info = pipe.to_display(text, lang, page=page)
        if not info:
            raise Unsupported(
                "the display renderer is not available",
                remedy="Install a font for this script (Linux: apt install fonts-noto-core).",
                code="no_display",
            )

        frame = info.pop("frame")
        if _field("format") == "packets":
            from .display import encode_frame
            info["packets_base64"] = [
                base64.b64encode(p).decode() for p in encode_frame(frame)
            ]
        else:
            info["png_base64"] = base64.b64encode(frame.to_png_bytes()).decode()
        return jsonify({"ok": True, **info})

    @app.post("/v1/read")
    def read():
        if "image" not in request.files:
            raise Unsupported("no image in request",
                              remedy="Send a multipart field named 'image'.")
        image = request.files["image"].read()
        return _respond(pipe.read(image, _field("image_lang", "en"), _field("lang", "hi")))

    return app


def main():
    logging.basicConfig(
        level=os.environ.get("DRISHTI_LOG", "INFO"),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    app = create_app()
    cfg = app.config["DRISHTI"]["server"]
    host, port = cfg["host"], int(cfg["port"])

    caps = app.config["PIPELINE"].capabilities()
    log.info("backends: %s", caps["backends"])
    log.info("listening on http://%s:%d", host, port)

    try:
        from waitress import serve
        serve(app, host=host, port=port, threads=8)
    except ImportError:
        log.warning("waitress not installed — using Flask's dev server")
        app.run(host=host, port=port, threaded=True)


if __name__ == "__main__":
    main()
