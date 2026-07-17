"""Remove black backgrounds from BOWYER brand lockup + wordmark."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

JOBS = [
    (ROOT / "assets" / "bowyer-lockup-raw.png", ROOT / "public" / "images" / "bowyer-lockup.png"),
    (ROOT / "assets" / "bowyer-wordmark-raw.png", ROOT / "public" / "images" / "bowyer-wordmark.png"),
]

for src, out in JOBS:
    img = Image.open(src).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = max(r, g, b)
            if lum <= 8:
                px[x, y] = (r, g, b, 0)
            elif lum < 60:
                px[x, y] = (r, g, b, int((lum - 8) / 52 * 255))
    bbox = img.getbbox()
    if bbox:
        pad = 10
        img = img.crop(
            (
                max(0, bbox[0] - pad),
                max(0, bbox[1] - pad),
                min(w, bbox[2] + pad),
                min(h, bbox[3] + pad),
            )
        )
    img.save(out)
    print(f"saved {out} {img.size}")
