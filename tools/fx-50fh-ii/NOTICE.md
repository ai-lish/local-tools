# Notice

This unofficial adaptation is based on [`throwingogo-hub/fx-50fh-ii`](https://github.com/throwingogo-hub/fx-50fh-ii), pinned to commit `84c53951d58e0ee890eae5fd96f248aefdc8db37` (2026-10-18). The upstream source code is distributed under the MIT License; see [LICENSE](LICENSE). Copyright (c) 2026 throwingogo-hub.

This browser simulation is not an official CASIO product and is not affiliated with, endorsed by, sponsored by, or approved by CASIO or the Hong Kong Examinations and Assessment Authority (HKEAA). Product names are used only to identify the calculator model being simulated. Verify important results on a physical calculator.

## Panel artwork changes

The following four upstream PNG files are intentionally omitted because they show CASIO and HKEAA marks or have image provenance outside the MIT code license:

- `assets/fx-50fh-ii.png` — upstream product photograph; replaced by the self-drawn `assets/fx-50fh-ii-panel.svg` and CSS key caps.
- `assets/fx-50fh-ii-generated.png` — upstream AI-generated faceplate showing CASIO and HKEAA marks; replaced by the self-drawn SVG panel and CSS key caps.
- `assets/fx-50fh-ii-generated-green.png` — green-background variant of that faceplate; replaced by the same SVG panel and CSS key caps.
- `assets/fx-50fh-ii-generated-transparent.png` — transparent cutout of that faceplate; replaced by the same SVG panel and CSS key caps.

The replacement illustration contains no CASIO logo or HKEAA approval wording. The calculator display remains a locally drawn canvas, and the 50 clickable key targets retain the upstream 881 × 1785 coordinate map.

## Build and test workflow

The upstream `.github/workflows/test.yml` is omitted so the requested checks remain manual and do not trigger private GitHub Actions. The upstream test suite is run locally with `npm test`.
