"""Шинэ киноны постер — киноны ӨӨРИЙН кадраас (эзэн 2026-10-11: «постерийн тэр
охины зургийг тавиад аятайхан постертой болгочих»; 2026-10-05: AI-аар зурсан,
кинотой холбоогүй зураг хүмүүсийг татдаггүй).

    python tools/make-poster.py --video <файл|url> --title "<нэр>" [--hook "<мөр>"] --out <jpg>

1. Бичлэгийн түлхүүр кадр бүрийг (keyframe) нэг удаад авч, кадр бүрийг дүгнэнэ: нүүр (OpenCV) хэр том, хэр
   тод, хэнийх вэ (SFace), ХАДМАЛ БИЧИГ байгаа эсэх (цагаан үсэг + хар хүрээ доод хэсэгт).
   Хадмалтай кадрыг хэзээ ч сонгохгүй. Шилдгийн орчмыг дахин нарийн хайна.
2. Постер: дээр нь алтан нэр, доор нь кадр БҮТНЭЭРЭЭ. Бусад багийн тамга
   (жишээ нь «Drama Sub Mongolia») кадр дээрээ үлдэнэ — тайрахгүй, бүдгэрүүлэхгүй,
   дээр нь юм тавихгүй (no-republishing дүрэм).

Сүүлийн мөр нь JSON: {"ok":..., "at": секунд, "face":..., "out":...}.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "brand" / "fonts"
FF = ROOT.parent / "tale2film" / "tools" / "ffmpeg"
W, H = 720, 1080
MODELS = Path(__file__).resolve().parent / "models"
# OpenCV zoo (Apache-2.0): YuNet finds faces, SFace tells whose face it is.
# Downloaded once into tools/models (not in git — 38 MB).
ZOO = "https://github.com/opencv/opencv_zoo/raw/main/models"
DETECT = ("face_detection_yunet_2023mar.onnx", f"{ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx")
RECOG = ("face_recognition_sface_2021dec.onnx", f"{ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx")
SAME = 0.363  # SFace's own cosine threshold for «the same person»


def model(spec: tuple[str, str]) -> str:
    path = MODELS / spec[0]
    if not path.exists():
        import urllib.request

        MODELS.mkdir(exist_ok=True)
        urllib.request.urlretrieve(spec[1], path)
    return str(path)


def tool(name: str) -> str:
    exe = FF / f"{name}.exe"
    return str(exe) if exe.exists() else name


def duration(video: str) -> float:
    out = subprocess.run(
        [tool("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def grab(video: str, t: float, dest: Path) -> np.ndarray | None:
    subprocess.run([tool("ffmpeg"), "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", str(dest)], check=False)
    return cv2.imread(str(dest)) if dest.exists() else None


def subtitle_score(im: np.ndarray) -> float:
    """Burned-in subtitles: near-white letters with a dark outline in the lower
    half. Calibrated on real frames (2026-10-11): clean 0.0, subtitled 4–11."""
    h = im.shape[0]
    band = im[int(h * 0.5) : int(h * 0.88)]
    white = (band.min(axis=2) > 225).astype(np.uint8)
    dark = (band.max(axis=2) < 60).astype(np.uint8)
    near = cv2.dilate(dark, np.ones((5, 5), np.uint8))
    return float((white & near).sum()) / white.size * 1000


class Faces:
    def __init__(self) -> None:
        self.detector = cv2.FaceDetectorYN.create(model(DETECT), "", (320, 320), 0.8)
        self.recognizer = cv2.FaceRecognizerSF.create(model(RECOG), "")

    def biggest(self, im: np.ndarray):
        """(face share of the frame, identity feature) of the biggest face, or None."""
        h, w = im.shape[:2]
        self.detector.setInputSize((w, h))
        _, found = self.detector.detect(im)
        if found is None or not len(found):
            return None
        f = max(found, key=lambda r: r[2] * r[3])
        feature = self.recognizer.feature(self.recognizer.alignCrop(im, f))
        return float(f[2] * f[3]) / (w * h), feature


def quality(im: np.ndarray, face: float) -> float:
    """A big, sharp, not-too-dark face."""
    gray = cv2.cvtColor(cv2.resize(im, (360, round(im.shape[0] * 360 / im.shape[1]))), cv2.COLOR_BGR2GRAY)
    sharp = min(1.0, cv2.Laplacian(gray, cv2.CV_64F).var() / 300)
    light = gray.mean() / 255
    return face * (0.5 + 0.5 * sharp) * (0.4 + 0.6 * min(1.0, light * 2.2))


def keyframes(video: str, work: Path) -> list[tuple[float, Path]]:
    """Every keyframe in ONE pass (decoding only keyframes is fast; 60 seeks
    took 3.5 min on a 12-min video), with its time."""
    dur = duration(video)
    log = subprocess.run(
        [tool("ffmpeg"), "-v", "info", "-y", "-skip_frame", "nokey", "-i", video, "-t", f"{max(5.0, dur * 0.85):.1f}",
         "-vf", "showinfo", "-fps_mode", "vfr", "-q:v", "2", str(work / "k%04d.jpg")],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    ).stderr
    times = [float(l.split("pts_time:")[1].split()[0]) for l in log.splitlines() if "pts_time:" in l]
    return [(t, work / f"k{i + 1:04d}.jpg") for i, t in enumerate(times) if (work / f"k{i + 1:04d}.jpg").exists()]


def pick(video: str, work: Path) -> tuple[Path, float, float, int]:
    """The MAIN character — the face seen in the most keyframes (2026-10-11:
    the biggest face alone chose the grandfather, the movie is about the
    girl) — at their best clean moment."""
    faces = Faces()
    seen = []  # (t, path, face share, feature, clean)
    for t, path in keyframes(video, work):
        im = cv2.imread(str(path)) if t >= 2 else None
        got = faces.biggest(im) if im is not None else None
        if got:
            seen.append((t, path, got[0], got[1], subtitle_score(im) <= 1.0, quality(im, got[0])))
    people: list[list[int]] = []  # indexes into seen, one list per person
    for i, row in enumerate(seen):
        for group in people:
            if faces.recognizer.match(seen[group[0]][3], row[3], cv2.FaceRecognizerSF_FR_COSINE) >= SAME:
                group.append(i)
                break
        else:
            people.append([i])
    people = [g for g in people if any(seen[i][4] for i in g)]
    if not people:
        raise SystemExit(json.dumps({"ok": False, "why": "no clean frame with a face"}))
    main = max(people, key=len)
    t, path, share, feature, _clean, _q = max((seen[i] for i in main if seen[i][4]), key=lambda r: r[5])
    best = (quality(cv2.imread(str(path)), share), t, share, path)
    # the face at its best moment: ±1.5 s around the winner, still the same person, still clean
    for k in range(13):
        tt = max(0.0, t - 1.5 + 0.25 * k)
        im = grab(video, tt, work / f"r{k:02d}.png")
        if im is None or subtitle_score(im) > 1.0:
            continue
        got = faces.biggest(im)
        if not got or faces.recognizer.match(feature, got[1], cv2.FaceRecognizerSF_FR_COSINE) < SAME:
            continue
        q = quality(im, got[0])
        if q > best[0]:
            best = (q, tt, got[0], work / f"r{k:02d}.png")
    return best[3], best[1], best[2], len(main)


def font(name: str, size: int, weight: str) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONTS / name), size)
    f.set_variation_by_name(weight)
    return f


def wrap(text: str, f, maxw: int) -> list[str]:
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if f.getlength(t) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def fit_title(text: str, maxw: int = 650):
    for size in range(92, 40, -4):
        f = font("PlayfairDisplay.ttf", size, "Black")
        lines = wrap(text, f, maxw)
        if len(lines) <= 2 and all(f.getlength(l) <= maxw for l in lines):
            return f, lines
    return f, lines


def gold_fill(size):
    g = Image.new("RGB", (1, size[1]))
    stops = [(0.0, (255, 243, 205)), (0.45, (238, 192, 96)), (0.75, (196, 134, 48)), (1.0, (140, 88, 30))]
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                g.putpixel((0, y), tuple(int(a + (b - a) * k) for a, b in zip(c0, c1)))
                break
    return g.resize(size)


def compose(frame: Path, title: str, hook: str, out: Path) -> None:
    pic = Image.open(frame).convert("RGB").filter(ImageFilter.SMOOTH)
    pic = pic.resize((W, round(pic.height * W / pic.width)), Image.LANCZOS)
    pic = pic.filter(ImageFilter.UnsharpMask(radius=2.2, percent=90, threshold=2))
    pic = ImageEnhance.Color(ImageEnhance.Contrast(pic).enhance(1.08)).enhance(1.12)
    black = Image.new("RGB", (W, H))
    tf, lines = fit_title(title.upper())
    asc, desc = tf.getmetrics()
    lh = int((asc + desc) * 0.92)
    y0 = 46
    hf = font("Oswald.ttf", 27, "Medium")
    hook_lines = wrap(hook.upper(), hf, 660) if hook else []
    block = y0 + lh * len(lines) + 14 + 44 * len(hook_lines)
    # behind: the frame's own colours, blurred and dark
    art = ImageEnhance.Brightness(pic.resize((W, H)).filter(ImageFilter.GaussianBlur(40))).enhance(0.45)
    top = Image.new("L", (W, H), 0)
    td = ImageDraw.Draw(top)
    for y in range(block + 10):
        td.line([(0, y), (W, y)], fill=225)
    art = Image.composite(black, art, top)
    # the whole frame, nothing cut or covered — its marks stay as they are
    down = block + 10
    room = H - down - 62
    shown = pic.resize((round(pic.width * room / pic.height), room), Image.LANCZOS) if pic.height > room else pic
    art.paste(shown, ((W - shown.width) // 2, down))
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    for i, l in enumerate(lines):
        md.text(((W - tf.getlength(l)) / 2, y0 + i * lh), l, font=tf, fill=255)
    art = Image.composite(black, art, mask.filter(ImageFilter.GaussianBlur(10)).point(lambda v: min(255, v * 2)))
    art = Image.composite(Image.new("RGB", (W, H), (40, 22, 6)), art, mask.filter(ImageFilter.MaxFilter(5)))
    gold = Image.new("RGB", (W, H), (238, 192, 96))
    band = gold_fill((W, asc + desc))
    for i in range(len(lines)):
        gold.paste(band, (0, y0 + i * lh))
    art = Image.composite(gold, art, mask)
    d = ImageDraw.Draw(art)
    hy = y0 + lh * len(lines) + 14
    for l in hook_lines:
        x = (W - hf.getlength(l)) / 2
        d.text((x + 2, hy + 2), l, font=hf, fill=(0, 0, 0))
        d.text((x, hy), l, font=hf, fill=(250, 238, 214))
        hy += 44
    bf = font("Oswald.ttf", 26, "Regular")
    brand = "КИНО МАНДАЛ  •  МОНГОЛ ХЭЛЭЭР"
    d.text(((W - bf.getlength(brand)) / 2, H - 50), brand, font=bf, fill=(227, 176, 79))
    out.parent.mkdir(parents=True, exist_ok=True)
    art.save(out, quality=90)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--hook", default="")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        frame, at, face, seen = pick(a.video, Path(tmp))
        compose(frame, a.title, a.hook, Path(a.out))
    print(json.dumps({"ok": True, "at": round(at, 2), "face": round(face, 3), "main_seen": seen, "out": a.out}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
