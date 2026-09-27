"""Facebook/Messenger-т линк явуулахад гарах зурагнууд (1200x630) — premium загвар.

  python tools/make-og.py            # public/og.jpg (нүүр) + public/og/<id>.jpg (кино бүр)

Яагаад: линк явуулахад гарах карт бол хүн сайтыг анх хардаг газар. Өмнө нь
бүдэг дэвсгэр дээр жижиг зураг байсан тул «царай муутай», хүмүүс дардаггүй байв.
Одоо: нүүр хуудсанд poster-уудын сэнс + лого + үнэ; кино бүрт poster + нэр +
төрөл/урт + тайлбар + «Эхний N минут үнэгүй». Нэр, үнэ, тайлбарыг админы засвартай
(Supabase md_series) нь авна, эс бөгөөс catalog.json-оос. Нуусан кино алгасна.

deploy.ps1-д make-landing.ps1-ийн ДАРАА ажиллана (ffmpeg-ийн энгийн зургийг дарж бичнэ).
"""
import json, os, sys, textwrap, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
FONT = ROOT / "brand" / "fonts" / "Inter.ttf"
W, H = 1200, 630
GOLD = (227, 176, 79)
GOLD_LIGHT = (246, 213, 142)
TEXT = (243, 243, 246)
MUTED = (184, 188, 199)
DIM = (130, 135, 148)
BG = (7, 8, 11)
SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co"
SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1"


def font(size, weight=b"Bold"):
    f = ImageFont.truetype(str(FONT), size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def spaced(draw, xy, text, fnt, fill, spacing):
    """Үсэг хоорондын зайтай бичиг (PIL-д letter-spacing байхгүй)."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + spacing
    return x


def gold_fill(size):
    """Алтан налуу өнгө (зүүн дээрээс баруун доош)."""
    w, h = size
    g = Image.new("RGB", (w, h))
    px = g.load()
    for yy in range(h):
        for xx in range(w):
            t = (xx / max(1, w - 1) + yy / max(1, h - 1)) / 2
            if t < 0.5:
                a, b, k = (247, 220, 154), (227, 176, 79), t / 0.5
            else:
                a, b, k = (227, 176, 79), (196, 138, 44), (t - 0.5) / 0.5
            px[xx, yy] = tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3))
    return g


def brand(img, x, y, scale=1.0):
    """Тэмдэг (алтан цагираг + гурвалжин) + «КИНО МАНДАЛ»."""
    d = ImageDraw.Draw(img)
    r = int(20 * scale)
    cx, cy = x + r, y + r
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=GOLD, width=max(2, int(3 * scale)))
    r2 = int(13 * scale)
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], outline=(150, 118, 60), width=1)
    t = int(8 * scale)
    d.polygon([(cx - t * 0.7, cy - t), (cx - t * 0.7, cy + t), (cx + t * 1.05, cy)], fill=GOLD)
    f = font(int(24 * scale), b"ExtraBold")
    tx = cx + r + int(14 * scale)
    ty = cy - int(15 * scale)
    tx = spaced(d, (tx, ty), "КИНО", f, TEXT, int(4 * scale))
    spaced(d, (tx + int(10 * scale), ty), "МАНДАЛ", f, GOLD_LIGHT, int(4 * scale))


def rounded(im, radius):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=radius, fill=255)
    out = Image.new("RGBA", im.size)
    out.paste(im.convert("RGBA"), (0, 0), m)
    return out


def shadow(size, radius, blur, alpha=170):
    w, h = size
    pad = blur * 3
    s = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(s).rounded_rectangle([pad, pad, pad + w, pad + h], radius=radius, fill=(0, 0, 0, alpha))
    return s.filter(ImageFilter.GaussianBlur(blur)), pad


def paste_card(canvas, im, x, y, radius, angle=0, blur=22):
    card = rounded(im, radius)
    sh, pad = shadow(card.size, radius, blur)
    if angle:
        card = card.rotate(angle, resample=Image.BICUBIC, expand=True)
        sh = sh.rotate(angle, resample=Image.BICUBIC, expand=True)
    canvas.alpha_composite(sh, (int(x - pad + (im.width - card.width) / 2 + 8), int(y - pad + (im.height - card.height) / 2 + 16)))
    canvas.alpha_composite(card, (int(x + (im.width - card.width) / 2), int(y + (im.height - card.height) / 2)))


def pill(d, x, y, text, fnt, filled):
    tw = d.textlength(text, font=fnt)
    h = fnt.size + 22
    w = int(tw + 40)
    if filled:
        g = gold_fill((w, h))
        m = Image.new("L", (w, h), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius=h // 2, fill=255)
        d._image.paste(g, (x, y), m)
        d.text((x + 20, y + 9), text, font=fnt, fill=(26, 18, 4))
    else:
        # PIL RGBA дээр хагас тунгалаг өнгийг холилгүй бичдэг — бүрэн өнгө ашиглана
        d.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, outline=(98, 102, 114), width=2, fill=(24, 26, 32))
        d.text((x + 20, y + 9), text, font=fnt, fill=TEXT)
    return x + w


def wrap(d, text, fnt, width, max_lines):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=fnt) <= width:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while d.textlength(lines[-1] + "…", font=fnt) > width and " " in lines[-1]:
            lines[-1] = lines[-1].rsplit(" ", 1)[0]
        lines[-1] += "…"
    return lines


def fmt_price(n):
    return f"{int(n):,}₮"


def fmt_dur(sec):
    m = max(1, round(sec / 60))
    return f"{m // 60} цаг {m % 60} мин" if m >= 60 else f"{m} мин"


def clean_art(poster):
    """Босоо (9:16) бичлэгийн poster-т шатсан хадмал, «DRAMA SUB» тамга доод хэсэгт
    байдаг (ихэвчлэн 58-65% өндөрт) — дээд 54%-ийг 2:3 хэлбэрээр авна."""
    if poster.height / poster.width > 1.6:
        h = int(poster.height * 0.54)
        w = min(poster.width, int(h / 1.5))
        x = (poster.width - w) // 2
        return poster.crop((x, 0, x + w, h))
    return poster


def ambient(poster, darkness=0.42):
    bg = poster.convert("RGB").resize((W, int(W * poster.height / poster.width)))
    top = max(0, (bg.height - H) // 3)
    bg = bg.crop((0, top, W, top + H)).filter(ImageFilter.GaussianBlur(40))
    return Image.blend(Image.new("RGB", (W, H), BG), bg, darkness)


def movie_card(s, poster_path, out):
    poster = clean_art(Image.open(poster_path).convert("RGB"))
    canvas = ambient(poster).convert("RGBA")
    # Зүүнээс баруун тийш бараан — бичиг тод уншигдана
    grad = Image.new("L", (W, 1))
    for x in range(W):
        grad.putpixel((x, 0), int(110 + 120 * min(1, x / 700)))
    canvas.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, H), c) for c in BG] + [grad.resize((W, H))]))

    ph = 540
    pw = int(ph * poster.width / poster.height)
    paste_card(canvas, poster.resize((pw, ph), Image.LANCZOS), 56, 45, 20)
    if "18+" in s["genre"]:
        d = ImageDraw.Draw(canvas)
        f18 = font(20, b"ExtraBold")
        bx, by = 56 + pw - 70, 60
        d.rounded_rectangle([bx, by, bx + 56, by + 32], radius=8, fill=(14, 14, 18), outline=(229, 72, 77), width=2)
        d.text((bx + 9, by + 4), "18+", font=f18, fill=TEXT)

    d = ImageDraw.Draw(canvas)
    x0 = 56 + pw + 56
    width = W - x0 - 56
    brand(canvas, x0, 56, 0.9)

    title = s["title"]
    size = 64
    while size > 40:
        ft = font(size, b"ExtraBold")
        lines = wrap(d, title, ft, width, 3)
        if len(lines) <= 2 or size <= 44:
            break
        size -= 4
    ty = 138
    for ln in lines:
        d.text((x0, ty), ln, font=ft, fill=TEXT)
        ty += int(size * 1.12)

    cats = [c.strip() for c in s["genre"].replace(",", "·").split("·") if c.strip() and c.strip() != "18+"]
    meta = "  •  ".join(cats + [fmt_dur(s["duration"])])
    d.text((x0, ty + 12), meta, font=font(24, b"Medium"), fill=MUTED)
    ty += 58

    if s.get("tagline"):
        fl = font(22, b"Regular")
        for ln in wrap(d, s["tagline"], fl, width, 3):
            d.text((x0, ty), ln, font=fl, fill=(201, 204, 212))
            ty += 32

    fp = font(22, b"Bold")
    by = H - 56 - (fp.size + 22)
    if s["price"] > 0:
        nx = pill(d, x0, by, f"▶  Эхний {int(s['free_minutes'])} минут үнэгүй", fp, True)
        pill(d, nx + 14, by, f"Бүтэн кино {fmt_price(s['price'])}", fp, False)
    else:
        pill(d, x0, by, "▶  Үнэгүй үзэх", fp, True)
    canvas.convert("RGB").save(out, quality=88, optimize=True, progressive=True)


def home_card(series, out, vip_price=None):
    canvas = Image.new("RGBA", (W, H), BG + (255,))
    # Баруун талд алтан туяа
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([640, 40, 1260, 640], fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    canvas.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, H), c) for c in (120, 84, 24)] + [glow]))

    # Тамга/хадмалгүй, хүн бүрт тохиромжтой poster-уудыг тэргүүнд (дунд нь хамгийн тод нь)
    prefer = ["series-260921-1402", "series-260926-1907", "series-260926-1908", "series-260923-1825", "series-260926-1620"]
    by_id = {p["id"]: p for p in series if p["poster_path"].exists()}
    picks = [by_id[i] for i in prefer if i in by_id]
    picks += [p for p in series if p["poster_path"].exists() and p not in picks]
    picks = picks[:5]
    # (poster, өнцөг, хэмжээ, төвийн x) — ард талынх эхэлж зурагдана
    order = [(3, -9, 0.76, 790), (4, 9, 0.76, 1090), (0, -4, 0.88, 860), (1, 4, 0.88, 1020), (2, 0, 1.0, 940)]
    base_h = 470
    for idx, ang, sc, cx in order:
        if idx >= len(picks):
            continue
        im = clean_art(Image.open(picks[idx]["poster_path"]).convert("RGB"))
        h = int(base_h * sc)
        w = int(h * im.width / im.height)
        paste_card(canvas, im.resize((w, h), Image.LANCZOS), cx - w // 2, (H - h) // 2 + (0 if sc == 1 else 18), 18, ang, 26)

    # Зүүн талыг бараан болгож бичгийн ард цэвэр зай гаргана
    grad = Image.new("L", (W, 1))
    for x in range(W):
        grad.putpixel((x, 0), int(max(0, 255 - max(0, x - 560) * 1.6)))
    canvas.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, H), c) for c in BG] + [grad.resize((W, H))]))

    d = ImageDraw.Draw(canvas)
    brand(canvas, 72, 70, 1.15)
    fh = font(60, b"ExtraBold")
    d.text((72, 168), "Монгол хадмалтай", font=fh, fill=TEXT)
    d.text((72, 238), "кинонууд онлайнаар", font=fh, fill=TEXT)
    fs = font(24, b"Medium")
    d.text((72, 330), "Эхний минутууд үнэгүй · QPay-ээр төлөөд шууд үз", font=fs, fill=MUTED)
    fp = font(22, b"Bold")
    prices = sorted({r["price"] for r in series if r["price"] > 0})
    single = (f"Нэг кино {fmt_price(prices[0])}" + ("-өөс" if len(prices) > 1 else "")) if prices else None
    nx = 72
    if vip_price:
        nx = pill(d, nx, 392, f"Бүх кино сард {fmt_price(vip_price)}", fp, True) + 14
    if single:
        pill(d, nx, 392, single, fp, not vip_price)
    d.text((72, H - 78), "kinomandal.com", font=font(22, b"SemiBold"), fill=DIM)
    canvas.convert("RGB").save(out, quality=88, optimize=True, progressive=True)


def main():
    catalog = json.loads((ROOT / "src" / "data" / "catalog.json").read_text(encoding="utf-8"))
    meta = {}
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/md_series?select=id,title,tagline,genre,price,free_minutes,hidden",
            headers={"apikey": SUPABASE_ANON, "User-Agent": "curl/8"},
        )
        meta = {r["id"]: r for r in json.load(urllib.request.urlopen(req, timeout=30))}
    except Exception as e:
        print("АНХААР: Supabase-аас нэр/үнэ авч чадсангүй — catalog.json-оор:", e)

    rows = []
    for c in catalog["series"]:
        m = meta.get(c["id"], {})
        if m.get("hidden"):
            continue
        dur = c.get("hls", {}).get("duration") or sum(e.get("duration", 0) for e in c.get("episodes", []))
        rows.append({
            "id": c["id"],
            "title": (m.get("title") or c["title"]).strip(),
            "tagline": (m.get("tagline") if m.get("tagline") is not None else c.get("tagline", "")).strip(),
            "genre": m.get("genre") or c.get("genre", ""),
            "price": int(m.get("price") if m.get("price") is not None else c.get("price", 0)),
            "free_minutes": float(m.get("free_minutes") if m.get("free_minutes") is not None else c.get("freeMinutes", 0)),
            "duration": dur,
            "poster_path": PUB / c["poster"],
        })

    vip_price = None
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/md_plans?select=price&active=eq.true&order=price.asc&limit=1",
            headers={"apikey": SUPABASE_ANON, "User-Agent": "curl/8"},
        )
        got = json.load(urllib.request.urlopen(req, timeout=30))
        vip_price = int(got[0]["price"]) if got else None
    except Exception as e:
        print("АНХААР: сарын эрхийн үнийг авч чадсангүй:", e)

    (PUB / "og").mkdir(exist_ok=True)
    n = 0
    for r in rows:
        if not r["poster_path"].exists():
            continue
        # Эзний өөрөө хийсэн хэвтээ зураг (brand/og-src) байвал түүнийг нь хэвээр үлдээнэ
        if (ROOT / "brand" / "og-src" / f"{r['id']}.jpg").exists():
            continue
        movie_card(r, r["poster_path"], PUB / "og" / f"{r['id']}.jpg")
        n += 1
    # Нүүр: шинэ кинонуудаас 18+ бишийг түрүүлж (хүн бүрт тохиромжтой нүүр царай)
    newest = list(reversed(rows))
    home = [r for r in newest if "18+" not in r["genre"]] + [r for r in newest if "18+" in r["genre"]]
    home_card(home, PUB / "og.jpg", vip_price)
    print(f"OG зураг: {n} кино + нүүр")


if __name__ == "__main__":
    sys.exit(main())
