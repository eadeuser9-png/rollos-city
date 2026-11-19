#!/usr/bin/env python3
"""Convert one exported Rollo SVG to a print PNG at a chosen width and height.
Requires: python3 -m pip install cairosvg pillow
This renders vectors cleanly; added pixels cannot add detail missing from the drawing.
"""
import argparse,io
from pathlib import Path
from PIL import Image
import cairosvg
ap=argparse.ArgumentParser()
ap.add_argument('svg',type=Path);ap.add_argument('output',type=Path)
ap.add_argument('--width',type=int,default=3000);ap.add_argument('--height',type=int,default=2400)
a=ap.parse_args()
if not(800<=a.width<=10000 and 800<=a.height<=10000):ap.error('Invalid size')
# Preserve the SVG aspect ratio and center on an opaque white print canvas.
# CairoSVG PNG renders preserve vector detail at the selected resolution.
import re
from xml.etree import ElementTree as ET
root=ET.fromstring(raw)
vb=[float(v) for v in re.split(r'[\s,]+',root.attrib.get('viewBox','').strip()) if v]
if len(vb)==4 and vb[2]>0 and vb[3]>0:
    aspect=vb[2]/vb[3]
else:
    ap.error('SVG requires a valid viewBox to preserve proportions')
if a.width/a.height>aspect:
    rendered_h=a.height;rendered_w=round(a.height*aspect)
else:
    rendered_w=a.width;rendered_h=round(a.width/aspect)
png=cairosvg.svg2png(bytestring=raw,output_width=rendered_w,output_height=rendered_h)
art=Image.open(io.BytesIO(png)).convert('RGBA')
im=Image.new('RGB',(a.width,a.height),'white')
im.paste(art,((a.width-rendered_w)//2,(a.height-rendered_h)//2),art)
im.save(a.output,format='PNG',dpi=(300,300),optimize=True)
print(f'Created {a.output} ({im.width} x {im.height}, no artwork cropped)')
