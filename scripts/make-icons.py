"""Draw the RentUK app icons with Pillow. Run: python3 scripts/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'icons'
TOP, BOTTOM = (79, 70, 229), (124, 58, 237)   # #4f46e5 -> #7c3aed, same as the buttons


def gradient(size):
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    return img


def house(draw, size, scale):
    """White house with a green tick; `scale` is the share of the icon it fills."""
    s = size * scale
    ox, oy = (size - s) / 2, (size - s) / 2
    p = lambda x, y: (ox + x * s, oy + y * s)
    w = round(s * 0.07)
    draw.polygon([p(0.5, 0.06), p(0.96, 0.46), p(0.04, 0.46)], fill='white')
    draw.rectangle([p(0.15, 0.44), p(0.85, 0.94)], fill='white')
    draw.line([p(0.30, 0.68), p(0.45, 0.82), p(0.72, 0.55)], fill=(4, 120, 87), width=w, joint='curve')


def make(size, scale, rounded, name):
    img = gradient(size)
    house(ImageDraw.Draw(img), size, scale)
    if rounded:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.22, fill=255)
        img.putalpha(mask)
    img.save(OUT / name, optimize=True)


OUT.mkdir(exist_ok=True)
for size in (192, 512):
    make(size, 0.62, True, f'icon-{size}.png')
    make(size, 0.48, False, f'maskable-{size}.png')   # keeps the house inside the 80% safe zone
make(180, 0.62, False, 'apple-touch-icon.png')          # iOS rounds the corners itself
make(32, 0.7, True, 'favicon-32.png')
print('icons written to', OUT)
