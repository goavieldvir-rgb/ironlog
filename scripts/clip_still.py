"""Pick the icon still for one exercise clip.

    python3 scripts/clip_still.py CLIP.mp4 OUT.jpg [--frame N] [--crop CX,CY,SIDE]

The still is the peak of the rep (far from the first, rest frame and briefly
still), cropped square around the figure and the kit it is using so
the movement still reads at 48 px. --frame forces a frame number, --crop a
square (centre and side, in the clip's 720 px frame) for clips where a tall
machine would otherwise shrink the figure. Overrides live in
scripts/clip_stills.txt.
"""
import subprocess
import sys

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

SIZE = 720
OUT = 256


def frames(path):
    raw = subprocess.run(
        ['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
        check=True, capture_output=True, stdin=subprocess.DEVNULL,
    ).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, SIZE, SIZE, 3)


def content_mask(img):
    # Background is a light studio backdrop: compare with its colour at the
    # border, so a grey wall still counts as background.
    border = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]).astype(int)
    bg = np.median(border, axis=0)
    return np.abs(img.astype(int) - bg).sum(axis=2) > 60


def dense_span(profile, total, frac=0.025):
    # Ignore thin things (cables, the far edge of a rack) when cropping.
    idx = np.where(profile > total * frac)[0]
    return (idx[0], idx[-1]) if len(idx) else (0, total - 1)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    forced = int(sys.argv[sys.argv.index('--frame') + 1]) if '--frame' in sys.argv else None
    fr = frames(src)
    small = fr[:, ::4, ::4].astype(np.int16)
    if forced is not None:
        pick = min(forced, len(fr) - 1)
    else:
        # The peak of the rep is where the body is far from the first (rest)
        # frame AND briefly still: at the top of a curl the forearm stops,
        # while the frame furthest from rest is usually mid-swing.
        diff = np.abs(small - small[0]).mean(axis=(1, 2, 3))
        vel = np.abs(np.diff(small, axis=0)).mean(axis=(1, 2, 3))
        vel = np.convolve(np.append(vel, vel[-1]), np.ones(5) / 5, mode='same')
        cand = np.where(diff >= diff.max() * 0.55)[0]
        pick = int(cand[np.argmin(vel[cand] / (diff[cand] / diff.max()))])
    img = fr[pick]
    if '--crop' in sys.argv:
        cx, cy, side = (int(v) for v in sys.argv[sys.argv.index('--crop') + 1].split(','))
        return save(img, cx, cy, side, dst, f'{src}: frame {pick}/{len(fr)} crop {side}px (set)')
    m = content_mask(img)
    y0, y1 = dense_span(m.sum(axis=1), SIZE)
    x0, x1 = dense_span(m.sum(axis=0), SIZE)
    side = int(max(y1 - y0, x1 - x0) * 1.10) + 8
    side = min(max(side, 200), SIZE)
    save(img, (x0 + x1) // 2, (y0 + y1) // 2, side, dst, f'{src}: frame {pick}/{len(fr)} crop {side}px')


def save(img, cx, cy, side, dst, note):
    side = min(side, SIZE)
    top = int(np.clip(cy - side // 2, 0, SIZE - side))
    left = int(np.clip(cx - side // 2, 0, SIZE - side))
    tile = Image.fromarray(img[top:top + side, left:left + side])
    tile = tile.resize((OUT, OUT), Image.LANCZOS)
    tile = ImageEnhance.Contrast(tile).enhance(1.15)
    tile = tile.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    tile.save(dst, quality=86, optimize=True)
    print(note)


if __name__ == '__main__':
    main()
