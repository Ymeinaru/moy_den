#!/usr/bin/env python3
"""Генерация иконок «Мой день» — тёмный круг с галочкой на бумажном фоне."""
from PIL import Image, ImageDraw

PAPER = (246, 244, 239, 255)
INK = (25, 26, 30, 255)
SS = 4  # суперсэмплинг для гладких краёв


def draw_mark(size, inset_ratio, path):
    big = size * SS
    img = Image.new("RGB", (big, big), PAPER[:3])
    d = ImageDraw.Draw(img)

    r = big * inset_ratio
    cx = cy = big / 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK[:3])

    # галочка
    w = max(2, int(big * 0.068))
    pts = [
        (cx - r * 0.42, cy + r * 0.02),
        (cx - r * 0.10, cy + r * 0.34),
        (cx + r * 0.46, cy - r * 0.34),
    ]
    d.line(pts, fill=PAPER[:3], width=w, joint="curve")
    for p in pts:
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=PAPER[:3])

    img = img.resize((size, size), Image.LANCZOS)
    img.save(path, "PNG", optimize=True)
    return path


if __name__ == "__main__":
    base = "icons/"
    draw_mark(192, 0.34, base + "icon-192.png")
    draw_mark(512, 0.34, base + "icon-512.png")
    draw_mark(512, 0.27, base + "icon-maskable-512.png")  # больше воздуха под маску
    draw_mark(180, 0.34, base + "apple-touch-icon.png")

    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#f6f4ef"/>
  <circle cx="32" cy="32" r="22" fill="#191a1e"/>
  <path d="M22.8 32.4l6.6 6.6l12-14.4" fill="none" stroke="#f6f4ef" stroke-width="5.2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
"""
    with open(base + "favicon.svg", "w", encoding="utf-8") as f:
        f.write(svg)
    print("ok")
