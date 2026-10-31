"""Generuje ikony i ekrany startowe iOS z plików w assets-src/.

Uruchom: python3 scripts/generate_assets.py  (wymaga Pillow)
Wejście:
  assets-src/icon-glyph-mask.png  maska znaku (biały = znak), kwadrat
  assets-src/splash-clean.png     ekran startowy bez paska postępu
Wyjście: public/icons/{prod,test}/..., public/splash/...
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src"
OUT = ROOT / "public"

ICON_BG = (6, 57, 69)        # #063945
ICON_FG = (244, 236, 218)    # #F4ECDA
TEST_BAND = (255, 200, 61)   # #FFC83D
TEST_TEXT = (6, 57, 69)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# iPhone (CSS szerokość, CSS wysokość, DPR) – obrazy pionowe
IPHONES = [
    (440, 956, 3), (430, 932, 3), (428, 926, 3), (420, 912, 3),
    (414, 896, 3), (414, 896, 2), (402, 874, 3), (393, 852, 3),
    (390, 844, 3), (375, 812, 3), (375, 667, 2),
]


def glyph_cropped() -> Image.Image:
    mask = Image.open(SRC / "icon-glyph-mask.png").convert("L")
    return mask.crop(mask.getbbox())


def render_icon(size: int, glyph_ratio: float, test: bool) -> Image.Image:
    """Pełny kwadrat (bez zaokrągleń – system przycina sam), znak wyśrodkowany."""
    scale = 4
    big = size * scale
    img = Image.new("RGB", (big, big), ICON_BG)
    g = glyph_cropped()
    band_h = int(big * 0.2) if test else 0
    # w wersji TEST znak mniejszy i nad paskiem
    target = int(big * glyph_ratio * (0.78 if test else 1))
    w, h = g.size
    k = target / max(w, h)
    g = g.resize((max(1, int(w * k)), max(1, int(h * k))), Image.LANCZOS)
    fg = Image.new("RGB", g.size, ICON_FG)
    img.paste(fg, ((big - g.size[0]) // 2, (big - band_h - g.size[1]) // 2), g)
    if test:
        draw = ImageDraw.Draw(img)
        draw.rectangle((0, big - band_h, big, big), fill=TEST_BAND)
        font = ImageFont.truetype(FONT, int(band_h * 0.62))
        draw.text((big // 2, big - band_h // 2), "TEST", fill=TEST_TEXT, font=font, anchor="mm")
    return img.resize((size, size), Image.LANCZOS)


def write_icons() -> None:
    for variant in ("prod", "test"):
        test = variant == "test"
        d = OUT / "icons" / variant
        d.mkdir(parents=True, exist_ok=True)
        # "any": znak jak w projekcie (ok. 80% kafelka)
        render_icon(512, 0.80, test).save(d / "icon-512.png", optimize=True)
        render_icon(192, 0.80, test).save(d / "icon-192.png", optimize=True)
        # "maskable": znak w strefie bezpiecznej (koło 80% średnicy)
        render_icon(512, 0.60, test).save(d / "maskable-512.png", optimize=True)
        render_icon(192, 0.60, test).save(d / "maskable-192.png", optimize=True)
        # iOS: pełny kwadrat 180 px
        render_icon(180, 0.76, test).save(d / "apple-touch-icon.png", optimize=True)
        render_icon(48, 0.86, test).save(d / "favicon-48.png", optimize=True)


def write_splash() -> None:
    src = Image.open(SRC / "splash-clean.png").convert("RGB")
    d = OUT / "splash"
    d.mkdir(parents=True, exist_ok=True)
    for cw, ch, dpr in IPHONES:
        w, h = cw * dpr, ch * dpr
        sw, sh = src.size
        k = max(w / sw, h / sh)
        r = src.resize((round(sw * k), round(sh * k)), Image.LANCZOS)
        left = (r.size[0] - w) // 2
        top = (r.size[1] - h) // 2
        r.crop((left, top, left + w, top + h)).save(d / f"splash-{w}x{h}.jpg", quality=82, optimize=True, progressive=True)
    # tło dla ekranu powitalnego w aplikacji
    src.save(d / "splash.jpg", quality=85, optimize=True, progressive=True)


def splash_links() -> str:
    lines = []
    for cw, ch, dpr in IPHONES:
        lines.append(
            f'<link rel="apple-touch-startup-image" href="/splash/splash-{cw*dpr}x{ch*dpr}.jpg" '
            f'media="(device-width: {cw}px) and (device-height: {ch}px) and '
            f'(-webkit-device-pixel-ratio: {dpr}) and (orientation: portrait)" />'
        )
    return "\n    ".join(lines)


if __name__ == "__main__":
    write_icons()
    write_splash()
    print(splash_links())
