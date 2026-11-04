"""Wycina ikony sekcji z planszy Jacka (assets-src/section-icons/plansza.webp) jako maski alfa.

Ikona = kształt z przezroczystością; kolor nadaje aplikacja (CSS mask + currentColor),
więc ta sama ikona jest żółta w motywie ciemnym i granatowa w jasnym.
Uruchomienie: python3 scripts/cut_section_icons.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets-src/section-icons/plansza.webp'
OUT_ALL = ROOT / 'assets-src/section-icons'
OUT_APP = ROOT / 'public/sections'
SIZE = 96  # px – ostre przy 28–32 px na ekranach 3x

ROWS = {  # wiersz planszy: (góra, dół) w pikselach
    'today': (215, 378),
    'plan': (397, 560),
    'flights': (577, 735),
    'hotels': (752, 908),
    'contacts': (925, 1072),
    'costs': (1088, 1232),
    'people': (1250, 1405),
}
COLS = {'A': (176, 344), 'B': (361, 528), 'C': (544, 712), 'D': (727, 895), 'E': (911, 1079)}

# Wybór wariantów (Jacek, 4.11.2026 – do zmiany jedną literą)
CHOICE = {'today': 'A', 'plan': 'A', 'flights': 'A', 'hotels': 'B', 'contacts': 'B', 'costs': 'A', 'people': 'A'}


def mask(tile: Image.Image) -> Image.Image:
    """Żółte piksele → nieprzezroczyste; tło i ramka kafelka → przezroczyste."""
    rgb = tile.convert('RGB')
    alpha = Image.new('L', rgb.size)
    px, out = rgb.load(), alpha.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = px[x, y]
            out[x, y] = max(0, min(255, int((r - b - 20) * 255 / 170)))
    box = alpha.getbbox()
    if not box:
        raise ValueError('pusty kafelek')
    alpha = alpha.crop(box)
    side = max(alpha.size)
    square = Image.new('L', (side, side))
    square.paste(alpha, ((side - alpha.width) // 2, (side - alpha.height) // 2))
    square = square.resize((SIZE, SIZE), Image.LANCZOS)
    icon = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    icon.putalpha(square)
    return icon


def main() -> None:
    sheet = Image.open(SRC)
    OUT_APP.mkdir(parents=True, exist_ok=True)
    pad = 12  # bez ramki kafelka
    for row, (top, bottom) in ROWS.items():
        for col, (left, right) in COLS.items():
            icon = mask(sheet.crop((left + pad, top + pad, right - pad, bottom - pad)))
            icon.save(OUT_ALL / f'{row}-{col}.png', optimize=True)
            if CHOICE[row] == col:
                icon.save(OUT_APP / f'{row}.png', optimize=True)
    print('Gotowe:', ', '.join(f'{k}={v}' for k, v in CHOICE.items()))


if __name__ == '__main__':
    main()
