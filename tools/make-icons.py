"""Сайтын icon-ууд (favicon, утасны дэлгэцэнд нэмэх icon) — алтан мандал тэмдэг.

  python tools/make-icons.py   # public/favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png

Нэг удаа ажиллуулна (лого өөрчлөгдвөл дахин). Brand.tsx-ийн BrandMark-тай ижил зураг.
"""
from pathlib import Path
from PIL import Image, ImageDraw

PUB = Path(__file__).resolve().parent.parent / "public"
BG = (7, 8, 11)

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7dc9a"/>
      <stop offset=".55" stop-color="#e3b04f"/>
      <stop offset="1" stop-color="#b47e25"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="8" fill="#07080b"/>
  <circle cx="16" cy="16" r="11.5" fill="none" stroke="url(#g)" stroke-width="2"/>
  <path d="M13.4 11.4v9.2a.7.7 0 0 0 1.05.6l7.3-4.6a.7.7 0 0 0 0-1.2l-7.3-4.6a.7.7 0 0 0-1.05.6Z" fill="url(#g)"/>
</svg>
"""


def gold(size):
    w, h = size
    g = Image.new("RGB", (w, h))
    px = g.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(1, w - 1) + y / max(1, h - 1)) / 2
            a, b, k = ((247, 220, 154), (227, 176, 79), t / 0.55) if t < 0.55 else ((227, 176, 79), (180, 126, 37), (t - 0.55) / 0.45)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3))
    return g


def icon(size, pad_ratio):
    """Дөрвөлжин бараан дэвсгэр + алтан цагираг + гурвалжин (maskable-д аюулгүй бүсэд)."""
    S = size * 4  # илүү том зурж багасгана — ирмэг зөөлөн
    img = Image.new("RGB", (S, S), BG)
    mask = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(mask)
    c = S / 2
    r = S * (0.5 - pad_ratio)
    wline = max(4, int(S * 0.055))
    d.ellipse([c - r, c - r, c + r, c + r], outline=255, width=wline)
    t = r * 0.42
    d.polygon([(c - t * 0.62, c - t), (c - t * 0.62, c + t), (c + t * 0.95, c)], fill=255)
    img.paste(gold((S, S)), (0, 0), mask)
    return img.resize((size, size), Image.LANCZOS)


def main():
    (PUB / "favicon.svg").write_text(SVG, encoding="utf-8")
    icon(512, 0.2).save(PUB / "icon-512.png", optimize=True)
    icon(192, 0.2).save(PUB / "icon-192.png", optimize=True)
    icon(180, 0.16).save(PUB / "apple-touch-icon.png", optimize=True)
    print("icons ok")


if __name__ == "__main__":
    main()
