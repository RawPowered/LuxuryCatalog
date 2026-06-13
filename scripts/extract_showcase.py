"""Extract redacted door showcase PNGs from catalog PDF. SKUs ABC-* -> LUX-*."""
import re
import sys
from pathlib import Path

import fitz

PDF = Path(sys.argv[1]) if len(sys.argv) > 1 else None
OUT = Path(__file__).resolve().parent.parent / "assets" / "showcase"
MAX_IMAGES = 12
SKIP_TEXT = re.compile(r"Impact Windows|abcimpact|1234 Window Way", re.I)


def sanitize_sku(sku: str) -> str:
    return re.sub(r"^ABC", "LUX", sku.strip(), flags=re.I)


def main() -> None:
    if not PDF or not PDF.exists():
        print("Usage: python scripts/extract_showcase.py <catalog.pdf>")
        sys.exit(1)

    OUT.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF)
    saved: set[str] = set()

    for page in doc:
        if len(saved) >= MAX_IMAGES:
            break
        text = page.get_text()
        if SKIP_TEXT.search(text):
            continue

        skus = []
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    s = span.get("text", "")
                    if s.startswith("SKU:"):
                        skus.append((sanitize_sku(s.replace("SKU:", "").strip()), span["bbox"][1]))

        images = page.get_images(full=True)
        for img_index, img in enumerate(images):
            if len(saved) >= MAX_IMAGES:
                break
            xref = img[0]
            try:
                pix = fitz.Pixmap(doc, xref)
            except Exception:
                continue
            if pix.width > 1200 or pix.height > 1200 or pix.width < 80:
                continue
            if pix.n >= 4:
                pix = fitz.Pixmap(fitz.csRGB, pix)

            sku = f"LUX-sample-{len(saved) + 1}"
            if skus:
                sku = skus[min(img_index, len(skus) - 1)][0] or sku
            sku = re.sub(r"[^a-zA-Z0-9-]", "", sku)
            if sku in saved:
                sku = f"{sku}-{len(saved)}"
            saved.add(sku)
            out_path = OUT / f"{sku}.png"
            pix.save(out_path)
            print("Saved", out_path.name)

    doc.close()
    print(f"Done: {len(saved)} images -> {OUT}")


if __name__ == "__main__":
    main()
