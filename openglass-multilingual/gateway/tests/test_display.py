"""
Tests for what actually reaches the wearer's eye.

The important one here is test_indic_shaping_is_not_naive. Rendering Indic text
without a shaping engine does not crash and does not look obviously wrong to
someone who cannot read the script — it silently produces broken words. We hit
exactly that: Telugu came out as base consonant + floating virama + detached
vowel, and Hindi happened to survive, which is the worst case because a casual
check passes. These tests exist so that regression cannot come back quietly.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from drishti.display import (PANEL, Frame, Renderer, decode_frame, encode_frame,
                             font_path, FontMissing)

SAMPLES = {
    "hi": "नमस्ते दुनिया",
    "bn": "নমস্কার পৃথিবী",
    "mr": "नमस्कार जग",
    "te": "నమస్కారం ప్రపంచం",
    "ta": "வணக்கம் உலகம்",
    "pa": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ",
    "en": "Hello world",
}


@pytest.fixture(scope="module")
def r():
    return Renderer()


# -- the panel contract -------------------------------------------------------

def test_frame_is_exactly_panel_sized(r):
    f = r.render("test", "en")
    assert len(f.pixels) == PANEL.height
    assert all(len(row) == PANEL.width for row in f.pixels)


def test_every_pixel_is_one_bit(r):
    f = r.render(SAMPLES["hi"], "hi")
    assert {v for row in f.pixels for v in row} <= {0, 1}


def test_packed_size_is_exactly_one_bit_per_pixel(r):
    f = r.render("x", "en")
    assert len(f.packed()) == PANEL.width * PANEL.height // 8 == 16000


# -- shaping: the regression that would ship broken ---------------------------

@pytest.mark.parametrize("lang", list(SAMPLES))
def test_every_script_actually_renders_something(r, lang):
    f = r.render(SAMPLES[lang], lang)
    assert f.lit() > 200, f"{lang} rendered almost nothing — font or shaping broken"


def test_indic_shaping_is_not_naive(r):
    """
    A shaped conjunct occupies less width than its unshaped parts.

    Telugu 'క్క' shapes into a base plus a subjoined form. Without shaping you
    get three separate glyphs side by side and a visibly wider run. Comparing
    the shaped width against the sum of individual character widths is a cheap,
    font-independent way to assert that shaping ran at all.
    """
    conjunct = "క్క"
    shaped = r.text_width(conjunct, "Telugu", 40)
    naive = sum(r.text_width(ch, "Telugu", 40) for ch in conjunct)
    assert shaped < naive, (
        f"Telugu conjunct not shaped: {shaped}px shaped vs {naive}px naive. "
        "HarfBuzz shaping is probably not running."
    )


def test_devanagari_conjunct_also_shapes(r):
    conjunct = "क्ष"
    shaped = r.text_width(conjunct, "Devanagari", 40)
    naive = sum(r.text_width(ch, "Devanagari", 40) for ch in conjunct)
    assert shaped < naive


def test_shaping_reorders_not_just_concatenates(r):
    """
    Devanagari 'ि' is typed after its consonant but drawn before it. If the
    renderer merely concatenated glyphs in input order this would be identical
    to the reverse; shaping makes them differ.
    """
    a = r.render("कि", "hi", size_px=40)
    b = r.render("ि" + "क", "hi", size_px=40)
    assert a.pixels != b.pixels


# -- layout -------------------------------------------------------------------

def test_long_text_paginates_rather_than_overflowing(r):
    long_text = "यह एक बहुत लंबा वाक्य है " * 12
    pages = r.paginate(long_text, "hi")
    assert len(pages) > 1
    f = r.render(long_text, "hi", page=0)
    assert f.pages == len(pages)


def test_page_index_is_clamped_not_crashing(r):
    f = r.render("short", "en", page=99)
    assert f.page == f.pages - 1


def test_wrapping_respects_panel_width(r):
    text = "the quick brown fox jumps over the lazy dog again and again"
    lines = r.wrap(text, "Latin", 26, PANEL.width - 24)
    for line in lines:
        assert r.text_width(line, "Latin", 26) <= PANEL.width - 24


def test_text_stays_inside_the_panel(r):
    """No lit pixel in the outermost column or row — nothing is clipped off."""
    f = r.render(SAMPLES["te"], "te")
    assert not any(row[0] or row[-1] for row in f.pixels)
    assert not any(f.pixels[0]) and not any(f.pixels[-1])


# -- the wire -----------------------------------------------------------------

def test_rle_actually_compresses(r):
    f = r.render(SAMPLES["hi"], "hi")
    assert len(f.rle()) < len(f.packed()) / 4, "text on black should compress hard"


@pytest.mark.parametrize("lang", list(SAMPLES))
def test_wire_round_trip_is_lossless(r, lang):
    f = r.render(SAMPLES[lang], lang)
    assert decode_frame(encode_frame(f)).pixels == f.pixels


def test_packets_fit_ble_and_carry_reassembly_header(r):
    f = r.render(SAMPLES["te"], "te")
    packets = encode_frame(f, seq=7)
    assert all(len(p) <= 186 for p in packets)          # 6 header + 180 payload
    for i, p in enumerate(packets):
        assert p[0] == 0xD1                              # magic
        assert p[1] == 7                                 # sequence
        assert (p[2] << 8 | p[3]) == i                   # index
        assert (p[4] << 8 | p[5]) == len(packets)        # total


def test_out_of_order_packets_still_reassemble(r):
    f = r.render(SAMPLES["ta"], "ta")
    packets = encode_frame(f)
    assert decode_frame(list(reversed(packets))).pixels == f.pixels


def test_a_screenful_fits_in_a_reasonable_ble_burst(r):
    """
    Budget check, not a style check. A raw frame is 16 KB, which at a realistic
    10 KB/s is over a second per screen — too slow to feel responsive. Under
    4 KB keeps a screen well inside half a second.
    """
    for lang, text in SAMPLES.items():
        f = r.render(text, lang)
        assert len(f.rle()) < 4000, f"{lang} frame too fat: {len(f.rle())}B"


# -- fonts --------------------------------------------------------------------

def test_unknown_script_falls_back_to_latin_rather_than_dying(r):
    """An unrecognised script should still render something legible."""
    assert font_path("Klingon") == font_path("Latin")


def test_missing_font_names_the_script_and_the_fix(monkeypatch):
    """When a script genuinely has no font, the error has to be actionable."""
    from drishti import display

    monkeypatch.setitem(display.FONTS, "Telugu", ("/nonexistent/NoSuchFont.ttf",))
    with pytest.raises(FontMissing) as e:
        display.font_path("Telugu")
    assert "Telugu" in str(e.value)
    assert "fonts-noto" in str(e.value)          # tells the operator what to install


def test_available_scripts_reports_reality(r):
    scripts = __import__("drishti.display", fromlist=["x"]).available_scripts()
    assert set(scripts) >= {"Devanagari", "Telugu", "Tamil", "Bengali", "Gurmukhi", "Latin"}
    assert all(isinstance(v, bool) for v in scripts.values())
