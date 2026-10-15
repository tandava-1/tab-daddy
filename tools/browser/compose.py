"""Places popup screenshots on 1280x800 store canvases with a caption.
Usage: .venv/bin/python compose.py <shots dir> <out dir>"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SHOTS, OUT = Path(sys.argv[1]), Path(sys.argv[2])
REPO = Path(__file__).resolve().parents[2]
HN = '/System/Library/Fonts/HelveticaNeue.ttc'
bold = lambda size: ImageFont.truetype(HN, size, index=1)
regular = lambda size: ImageFont.truetype(HN, size, index=0)
BG, INK, DIM, ACCENT = (255, 246, 239), (22, 24, 29), (90, 96, 110), (232, 89, 12)

SHOTS_SPEC = [
    ('groups', "Groups tabs by what\nyou're doing",
     'Shopping, Social, Coding, Sheets and more. Loose tabs join the groups you already have first, and everything else is grouped by topic.'),
    ('dups', 'Close duplicate tabs\nin one click',
     'The same page counts as a duplicate even with tracking codes or a different address. Reopen closed brings them back.'),
]

def wrap(draw, text, font, width):
    lines, line = [], ''
    for word in text.split():
        trial = (line + ' ' + word).strip()
        if draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + [line]

OUT.mkdir(parents=True, exist_ok=True)
icon = Image.open(REPO / 'icons/icon128.png').convert('RGBA').resize((56, 56), Image.LANCZOS)
for i, (name, head, sub) in enumerate(SHOTS_SPEC, 1):
    canvas = Image.new('RGB', (1280, 800), BG)
    draw = ImageDraw.Draw(canvas)
    pop = Image.open(SHOTS / f'{name}.png').convert('RGB')
    h = 720
    w = round(pop.width * h / pop.height)
    pop = pop.resize((w, h), Image.LANCZOS)
    x, y = 1280 - w - 90, 40
    shadow = Image.new('L', (1280, 800), 0)
    ImageDraw.Draw(shadow).rounded_rectangle([x, y + 10, x + w, y + h + 10], 18, fill=70)
    canvas.paste((180, 140, 110), (0, 0), shadow.filter(ImageFilter.GaussianBlur(18)))
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], 16, fill=255)
    canvas.paste(pop, (x, y), mask)
    canvas.paste(icon, (90, 150), icon)
    draw.text((160, 160), 'Tab Daddy', font=bold(30), fill=ACCENT)
    ty = 250
    for line in head.split('\n'):
        draw.text((90, ty), line, font=bold(46), fill=INK)
        ty += 58
    ty += 18
    for line in wrap(draw, sub, regular(24), 520):
        draw.text((90, ty), line, font=regular(24), fill=DIM)
        ty += 34
    out = OUT / f'{i}-{name}.png'
    canvas.save(out)
    print(out, canvas.size, canvas.mode)
