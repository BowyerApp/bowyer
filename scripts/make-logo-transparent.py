"""Remove the black background from the BOWYER logo, preserving glow edges."""
from PIL import Image

SRC = "/Users/jamison/.cursor/projects/Users-jamison-untitled-folder-8/assets/BOWYER-97f2b3be-5466-4580-8500-41193272ccc6.png"
OUT = "public/images/bowyer-logo.png"

img = Image.open(SRC).convert("RGBA")
px = img.load()
w, h = img.size

for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        lum = max(r, g, b)
        # Luminance-as-alpha for near-black background: dark pixels fade out,
        # bright logo pixels stay opaque. Threshold keeps the metallic body solid.
        if lum <= 8:
            px[x, y] = (r, g, b, 0)
        elif lum < 60:
            px[x, y] = (r, g, b, int((lum - 8) / 52 * 255))
        # else: keep fully opaque

# Trim transparent border, keep small padding
bbox = img.getbbox()
if bbox:
    pad = 12
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(w, bbox[2] + pad)
    bottom = min(h, bbox[3] + pad)
    img = img.crop((left, top, right, bottom))

img.save(OUT)
print(f"saved {OUT} {img.size}")

# Square icon version (padded to square) for favicon/app icon use
side = max(img.size)
icon = Image.new("RGBA", (side, side), (0, 0, 0, 0))
icon.paste(img, ((side - img.size[0]) // 2, (side - img.size[1]) // 2))
icon.save("public/images/bowyer-icon.png")
print(f"saved public/images/bowyer-icon.png {icon.size}")

# 32px favicon
icon.resize((64, 64), Image.LANCZOS).save("src/app/icon.png")
print("saved src/app/icon.png (64x64)")
