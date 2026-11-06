# -*- coding: utf-8 -*-
"""生成应用图标 icon.ico / web/icon.png"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 512
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([16, 16, S - 16, S - 16], radius=104, fill=(158, 43, 36, 255))
d.rounded_rectangle([34, 34, S - 34, S - 34], radius=88, outline=(253, 246, 231, 70), width=6)
f = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 300)
bb = d.textbbox((0, 0), '傷', font=f)
d.text(((S - bb[2] - bb[0]) / 2, (S - bb[3] - bb[1]) / 2 - 14), '傷', font=f, fill=(253, 246, 231, 255))
img.save(os.path.join(ROOT, 'web', 'icon.png'))
img.resize((256, 256), Image.LANCZOS).save(os.path.join(ROOT, 'icon.ico'),
                                          sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('icon ok')
