#!/usr/bin/env python3
"""Convert a text-based PDF into UTF-8 TXT volumes for Rollo's Library.
Usage: python3 tools/pdf_to_rollo_txt.py ~/Downloads/book.pdf
One or more files below 1.5MB are written beside the source PDF.
Requires: python3 -m pip install pymupdf
This script does not perform OCR or upload content automatically.
"""
from pathlib import Path
import sys
MAX_TEXT_BYTES=1_450_000

def convert(source):
    try:
        import fitz
    except ImportError:
        raise SystemExit('PyMuPDF is required. Run: python3 -m pip install pymupdf')
    source=Path(source).expanduser().resolve()
    if not source.is_file() or source.suffix.lower()!='.pdf':
        raise SystemExit('Pass an existing .pdf file path.')
    volumes=[];piece='';nonempty=0
    with fitz.open(source) as pdf:
        if pdf.needs_pass: raise SystemExit('Encrypted PDF: unlock it first if authorized.')
        for i,page in enumerate(pdf):
            text=page.get_text('text').strip()
            if not text: continue
            nonempty+=1
            chunk=f'\n\n[Page {i+1}]\n{text}\n'
            if len(chunk.encode('utf-8'))>MAX_TEXT_BYTES:
                raise SystemExit(f'Page {i+1} alone is over 1.45 MB. Split the source first.')
            if len((piece+chunk).encode('utf-8'))>MAX_TEXT_BYTES:
                volumes.append(piece.strip());piece=''
            piece+=chunk
    if piece.strip():volumes.append(piece.strip())
    if nonempty==0 or sum(map(len,volumes))<200:
        raise SystemExit('No meaningful selectable text. A scanned/image PDF needs OCR first.')
    outputs=[]
    for i,content in enumerate(volumes,1):
        out=source.with_name(source.stem+(f'_part_{i:02d}' if len(volumes)>1 else '')+'.txt')
        out.write_text(content,encoding='utf-8')
        outputs.append(out)
    print(f'Extracted text from {nonempty} pages into {len(outputs)} UTF-8 file(s):')
    for path in outputs:print(f'  {path} ({path.stat().st_size:,} bytes)')
    print('Upload each TXT in Rollo Library. This process does NOT upload or publish it automatically.')

if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit(__doc__)
    convert(sys.argv[1])
