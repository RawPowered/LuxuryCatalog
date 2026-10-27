# Evidence, redaction and validation

[Overview](../README.md) · [Gallery](GALLERY.md) · [Asset manifest](evidence-manifest.json)

## What the collection contains

| Evidence | What it establishes |
|:--|:--|
| Supplied line-art captures, February 25, 2026 | The starting drawings provided to the builder. The original door designs are credited as supplied input. |
| Material-guide captures, March 11, 2026 | Red/blue control images used to distinguish glass and solid structure. The source confirms the intended color mapping. |
| Side-by-side captures, March 16, 2026 | A historical interface displaying guides and intermediate renders. |
| Queue/output captures, April 4-5, 2026 | Finished variants and visible review controls in the historical application. |
| Supplied 78-page PDF | A concrete catalog output artifact. Three full pages and two door-only crops are selected for public display. |
| Existing repository sample renders | The earlier public render collection, retained in the gallery. Individual model-call histories are not supplied. |
| Source implementation | Reviewable generation, queue, image-processing, PDF, recovery and commerce code. |

The two February 23 layout captures are included as early catalog context. The captures alone do not establish authorship of every image inside those earlier layouts. The additional montage is undated. Screenshot filenames supply capture dates; embedded timestamps were not independently authenticated.

## How the public copies were prepared

- Originals remain private and unchanged.
- Identifying headers were cropped or covered with opaque black rectangles. Product identifiers and client footer text were removed from selected catalog pages.
- Screenshot derivatives were written as fresh PNGs without original metadata. The render artwork was not regenerated or retouched for this showcase.
- The before/output board arranges preserved pixels from a supplied drawing and two catalog crops. It is a new presentation layout, not a historical application screenshot.
- The public PDF contains only three selected, rasterized and redacted pages. Brand text was removed from the pixels before those images were placed into a fresh document, preventing recovery through a hidden text layer.
- The full 78-page original, branded cover/contact pages and low-resolution source-sheet overview remain private. The gallery provides the complete curated evidence set, rather than the entire client catalog.

Each new gallery asset has a neutral filename and a provenance entry in [evidence-manifest.json](evidence-manifest.json). Page numbers refer to physical pages in the supplied PDF. Page layout and historical finish labels are retained.

## How to interpret the results

The visual examples show generated catalog imagery, not verified photographs of manufactured doors. Source prompts request design fidelity and realistic material appearance; their wording does not guarantee accuracy. The public comparison uses matching motif families without claiming a reconstructed, deterministic model-call trace.

The supplied PDF establishes export output. It does not by itself establish current model availability, a successful full restore, a completed WooCommerce import, commercial print approval or measured business results. The public repository is newer than the separately supplied local application snapshot; the historical captures may reflect earlier iterations.

## Publication checks

Prepared October 26-27, 2026. The graphics and redacted excerpts were visually inspected; six Markdown files had their local links checked and twelve SVGs were parsed. The three-page PDF was rendered again for review. Each public PDF page contains one raster image and no searchable text.

`npm run lint` and `npm run build` pass after compatible dependency updates and an upgrade to PDF.js 6.4.299. The build reports a large JavaScript chunk. The remaining `npm audit` finding is one low-severity issue in a transitive `esbuild` dependency used by `tsx`; the PDF.js high-severity finding was resolved. A live provider generation run, PDF recovery run and WordPress import were outside this documentation pass, so the source map describes their implementation rather than presenting new runtime measurements.

No new image-generation requests, paid provider calls, client-site actions or production catalog changes were made for this update.
