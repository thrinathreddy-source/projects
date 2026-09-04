"""
Rendering text onto the glasses.

This is not "draw a string". The target is a 640x200 monochrome green waveguide
with one bit per pixel, and the text on it is Devanagari, Telugu, Tamil,
Bengali and Gurmukhi. Two facts drive everything here:

1. **Indic scripts must be shaped, not just drawn.** Pillow on this machine has
   no Raqm, and rendering without shaping is visibly broken: we tested it, and
   Telugu conjuncts came out as a base consonant, a floating virama and a
   detached vowel. Hindi happened to survive; Telugu and Tamil did not. So we
   shape with HarfBuzz and rasterise glyph-by-glyph with FreeType. Never hand a
   complex script to a naive text-drawing call.

2. **One bit per pixel is the output, not an afterthought.** A waveguide pixel
   is lit or it is not. Anti-aliased grey is a lie that turns into dither noise
   on the panel, so we threshold deliberately and pick a threshold that keeps
   thin Devanagari strokes and Telugu loops alive.

The wire format at the bottom exists because a raw frame is 16,000 bytes and
BLE will not carry that at any useful rate. See PANEL and encode_frame().
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("drishti.display")


# ---------------------------------------------------------------------------
# The panel we are targeting
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Panel:
    width: int = 640
    height: int = 200
    #: The real engines are green-only. Colour is not a thing we can choose.
    monochrome: bool = True
    #: Waveguide efficiency is low and the wearer sees this against daylight;
    #: thin strokes disappear before thick ones do.
    min_text_px: int = 26


PANEL = Panel()


# ---------------------------------------------------------------------------
# Fonts, per script
# ---------------------------------------------------------------------------

# Ordered candidates. First that exists wins. macOS paths first because that is
# where this is developed; the Noto paths are what a Linux hub will have.
FONTS: dict[str, tuple[str, ...]] = {
    "Devanagari": (
        "/System/Library/Fonts/Supplemental/Devanagari Sangam MN.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
    ),
    "Bengali": (
        "/System/Library/Fonts/Supplemental/Bangla Sangam MN.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf",
    ),
    "Telugu": (
        "/System/Library/Fonts/Supplemental/Telugu Sangam MN.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansTelugu-Regular.ttf",
    ),
    "Tamil": (
        "/System/Library/Fonts/Supplemental/Tamil Sangam MN.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf",
    ),
    "Gurmukhi": (
        "/System/Library/Fonts/Supplemental/Gurmukhi Sangam MN.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansGurmukhi-Regular.ttf",
    ),
    "Latin": (
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ),
}

SCRIPT_FOR_LANG = {
    "hi": "Devanagari", "mr": "Devanagari", "bn": "Bengali",
    "te": "Telugu", "ta": "Tamil", "pa": "Gurmukhi", "en": "Latin",
}


class FontMissing(RuntimeError):
    pass


def font_path(script: str) -> str:
    for candidate in FONTS.get(script, FONTS["Latin"]):
        if Path(candidate).is_file():
            return candidate
    raise FontMissing(
        f"no font installed for {script}. On Linux: apt install fonts-noto-core"
    )


def available_scripts() -> dict[str, bool]:
    out = {}
    for script in FONTS:
        try:
            font_path(script)
            out[script] = True
        except FontMissing:
            out[script] = False
    return out


# ---------------------------------------------------------------------------
# Shaping + rasterising
# ---------------------------------------------------------------------------

class Renderer:
    """
    Shapes with HarfBuzz, rasterises with FreeType, composites into a 1-bit
    buffer. Font faces are cached — loading a face per frame at 20 Hz would
    dominate the frame budget.
    """

    def __init__(self, panel: Panel = PANEL, threshold: int = 96):
        self.panel = panel
        # Threshold is low on purpose. Devanagari's horizontal bar and Telugu's
        # loops are thin; a 128 midpoint eats them and the wearer sees gaps.
        self.threshold = threshold
        self._faces: dict[tuple[str, int], tuple] = {}

    def _face(self, script: str, size_px: int):
        key = (script, size_px)
        if key in self._faces:
            return self._faces[key]

        import freetype
        import uharfbuzz as hb

        path = font_path(script)
        ft = freetype.Face(path)
        ft.set_pixel_sizes(0, size_px)

        with open(path, "rb") as fh:
            blob = hb.Blob(fh.read())
        hb_font = hb.Font(hb.Face(blob))
        hb_font.scale = (size_px * 64, size_px * 64)
        hb.ot_font_set_funcs(hb_font)

        self._faces[key] = (ft, hb_font)
        return self._faces[key]

    def shape(self, text: str, script: str, size_px: int):
        """Return (glyph_id, x_advance, x_offset, y_offset) in pixels."""
        import uharfbuzz as hb

        _, hb_font = self._face(script, size_px)
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(hb_font, buf, {"kern": True, "liga": True})

        out = []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            out.append((info.codepoint, pos.x_advance / 64.0,
                        pos.x_offset / 64.0, pos.y_offset / 64.0))
        return out

    def text_width(self, text: str, script: str, size_px: int) -> int:
        return int(sum(g[1] for g in self.shape(text, script, size_px)))

    def draw_line(self, pixels, text: str, script: str, size_px: int,
                  origin_x: int, baseline_y: int) -> None:
        """Composite one shaped line into a 2-D list-of-bytearrays buffer."""
        import freetype

        ft, _ = self._face(script, size_px)
        pen_x = float(origin_x)
        W, H = self.panel.width, self.panel.height

        for gid, adv, dx, dy in self.shape(text, script, size_px):
            ft.load_glyph(gid, freetype.FT_LOAD_RENDER)
            bmp = ft.glyph.bitmap
            left, top = ft.glyph.bitmap_left, ft.glyph.bitmap_top

            gx = int(pen_x + dx) + left
            gy = int(baseline_y - dy) - top

            for row in range(bmp.rows):
                y = gy + row
                if not (0 <= y < H):
                    continue
                base = row * bmp.pitch
                dest = pixels[y]
                for col in range(bmp.width):
                    x = gx + col
                    if 0 <= x < W and bmp.buffer[base + col] >= self.threshold:
                        dest[x] = 1
            pen_x += adv

    # -- layout ------------------------------------------------------------

    def wrap(self, text: str, script: str, size_px: int, max_width: int) -> list[str]:
        """
        Greedy word wrap on shaped widths.

        Measuring the shaped run rather than summing character widths matters:
        in Devanagari a conjunct is narrower than its parts, so per-character
        arithmetic overestimates and wraps too early.
        """
        words, lines, cur = text.split(), [], ""
        for w in words:
            trial = f"{cur} {w}".strip()
            if cur and self.text_width(trial, script, size_px) > max_width:
                lines.append(cur)
                cur = w
            else:
                cur = trial
        if cur:
            lines.append(cur)
        return lines or [""]

    def paginate(self, text: str, lang: str, size_px: int | None = None,
                 padding: int = 12) -> list[list[str]]:
        """Split text into screens that fit the panel."""
        script = SCRIPT_FOR_LANG.get(lang, "Latin")
        size = size_px or self.panel.min_text_px
        line_h = int(size * 1.55)
        usable_w = self.panel.width - padding * 2
        per_page = max(1, (self.panel.height - padding * 2) // line_h)

        lines = self.wrap(text, script, size, usable_w)
        return [lines[i:i + per_page] for i in range(0, len(lines), per_page)] or [[""]]

    def render(self, text: str, lang: str, size_px: int | None = None,
               padding: int = 12, page: int = 0) -> "Frame":
        script = SCRIPT_FOR_LANG.get(lang, "Latin")
        size = size_px or self.panel.min_text_px
        line_h = int(size * 1.55)

        pages = self.paginate(text, lang, size, padding)
        page = max(0, min(page, len(pages) - 1))
        lines = pages[page]

        W, H = self.panel.width, self.panel.height
        pixels = [bytearray(W) for _ in range(H)]

        # Vertically centre the block — a HUD sitting slightly high in the eye
        # reads better than one pinned to a corner.
        block_h = line_h * len(lines)
        y = max(padding, (H - block_h) // 2) + int(size * 0.85)

        for line in lines:
            self.draw_line(pixels, line, script, size, padding, y)
            y += line_h

        return Frame(pixels, self.panel, page=page, pages=len(pages))


# ---------------------------------------------------------------------------
# A frame, and how it goes over the air
# ---------------------------------------------------------------------------

@dataclass
class Frame:
    pixels: list[bytearray]      # [h][w], each 0 or 1
    panel: Panel
    page: int = 0
    pages: int = 1

    def lit(self) -> int:
        return sum(sum(row) for row in self.pixels)

    def packed(self) -> bytes:
        """1 bit per pixel, MSB first, row-major. 640x200 -> 16,000 bytes."""
        out = bytearray()
        for row in self.pixels:
            acc = bits = 0
            for v in row:
                acc = (acc << 1) | v
                bits += 1
                if bits == 8:
                    out.append(acc)
                    acc = bits = 0
            if bits:
                out.append(acc << (8 - bits))
        return bytes(out)

    def rle(self) -> bytes:
        """
        Run-length encode the packed bitmap.

        Text on an unlit field is mostly long runs of zero bytes, so this is
        where the transport becomes viable: a raw frame is 16,000 bytes, which
        over BLE at a realistic 10 KB/s is ~1.6 s per screen. Compressed, a
        typical line of text lands well under 1,000 bytes.

        Format: repeating [count:1][value:1], count 1..255.
        """
        data = self.packed()
        out = bytearray()
        i = 0
        while i < len(data):
            v = data[i]
            n = 1
            while i + n < len(data) and data[i + n] == v and n < 255:
                n += 1
            out += bytes((n, v))
            i += n
        return bytes(out)

    def to_png_bytes(self, scale: int = 1, green: bool = True) -> bytes:
        """The wearer's view as PNG bytes, for the preview in the app."""
        import io

        from PIL import Image

        W, H = self.panel.width, self.panel.height
        img = Image.new("RGB", (W, H), (0, 0, 0))
        px = img.load()
        on = (110, 231, 135) if green else (255, 255, 255)
        for y, row in enumerate(self.pixels):
            for x, v in enumerate(row):
                if v:
                    px[x, y] = on
        if scale != 1:
            img = img.resize((W * scale, H * scale), Image.NEAREST)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def to_png(self, path: str, scale: int = 1, green: bool = True) -> str:
        """
        What the wearer actually sees. Used by the simulator and by tests —
        being able to look at the real output is the only way to catch a
        shaping bug before hardware exists.
        """
        from PIL import Image

        W, H = self.panel.width, self.panel.height
        img = Image.new("RGB", (W, H), (0, 0, 0))
        px = img.load()
        on = (110, 231, 135) if green else (255, 255, 255)
        for y, row in enumerate(self.pixels):
            for x, v in enumerate(row):
                if v:
                    px[x, y] = on
        if scale != 1:
            img = img.resize((W * scale, H * scale), Image.NEAREST)
        img.save(path)
        return path


# ---------------------------------------------------------------------------
# BLE framing
# ---------------------------------------------------------------------------

#: Conservative BLE ATT payload. Negotiated MTU is often larger, but assuming
#: the floor means the firmware never has to handle a packet it did not expect.
CHUNK = 180

MAGIC = 0xD1


def encode_frame(frame: Frame, seq: int = 0) -> list[bytes]:
    """
    Split a compressed frame into BLE notification packets.

    Header, 6 bytes:
        0  magic 0xD1
        1  sequence, wraps at 256 — lets the firmware drop a stale half-frame
        2  packet index high
        3  packet index low
        4  total packets high
        5  total packets low

    The firmware reassembles by index, decompresses, and blits. A frame with a
    missing packet is discarded whole rather than shown torn.
    """
    payload = frame.rle()
    total = max(1, (len(payload) + CHUNK - 1) // CHUNK)
    packets = []
    for i in range(total):
        head = bytes((MAGIC, seq & 0xFF, (i >> 8) & 0xFF, i & 0xFF,
                      (total >> 8) & 0xFF, total & 0xFF))
        packets.append(head + payload[i * CHUNK:(i + 1) * CHUNK])
    return packets


def decode_frame(packets: list[bytes], panel: Panel = PANEL) -> Frame:
    """Inverse of encode_frame. Exists so tests can prove the round trip."""
    ordered = sorted(packets, key=lambda p: (p[2] << 8) | p[3])
    payload = b"".join(p[6:] for p in ordered)

    unpacked = bytearray()
    for i in range(0, len(payload) - 1, 2):
        unpacked += bytes((payload[i + 1],)) * payload[i]

    pixels = [bytearray(panel.width) for _ in range(panel.height)]
    row_bytes = (panel.width + 7) // 8
    for y in range(panel.height):
        for xb in range(row_bytes):
            idx = y * row_bytes + xb
            if idx >= len(unpacked):
                break
            byte = unpacked[idx]
            for bit in range(8):
                x = xb * 8 + bit
                if x < panel.width:
                    pixels[y][x] = (byte >> (7 - bit)) & 1
    return Frame(pixels, panel)
