# Notice

This fx-3650P adaptation uses the shared engine from [`throwingogo-hub/fx-50fh-ii`](https://github.com/throwingogo-hub/fx-50fh-ii), pinned to commit `84c53951d58e0ee890eae5fd96f248aefdc8db37` (2026-10-18). The upstream code is MIT licensed; see [LICENSE](LICENSE). Copyright (c) 2026 throwingogo-hub.

This is an unofficial browser simulation. It is not affiliated with, endorsed by, sponsored by, or approved by CASIO or the Hong Kong Examinations and Assessment Authority (HKEAA). Verify important results on a physical calculator.

## Model and manual

The model profile is based on the official shared [fx-3650P / fx-3950P User's Guide](https://support.casio.com/pdf/004/fx3650_3950P_E.pdf). The inspected source copy was `fx3650_3950p_users_guide.pdf`, SHA-256 `4ac1fd914407e75ada12cd2ea527b5cfc14824e6262c447bf159f786d9ac0cf5`.

- E-7–E-8: key functions and COMP, CMPLX, BASE, SD, REG, PRGM, RUN and PCL modes.
- E-9: 79 input steps; SHIFT and ALPHA prefixes do not add a step.
- E-16: Ans and independent M memory are separate.
- E-50: angle-specific trigonometric input limits and tangent poles.
- E-45: 360 bytes maximum for program text, with a 24-byte program-management area; statistics and programs use shared memory.
- E-54: fx-3650P power supply and physical specifications.

The menu presents those manual modes as numbered choices. Program text is capped at the manual's 360-byte maximum, and statistical entries share the documented 640-byte store, including the 256-byte statistics-only area and 24-byte program-management reservation. The faceplate and key positions are a self-drawn functional schematic: the manual documents key operations but does not specify pixel coordinates. No product photo or upstream panel artwork is included here.

## Scope limits and artwork

- The shared engine does not implement the manual's differential and integration calculations (E-34). The physical `∫dx` / `d/dx` key is shown disabled and does not invoke the engine.
- The 40-item scientific-constants menu and 23-item formula library are fx-50FH II additions and are disabled in this profile.
- The local SVG panel is original code-created artwork. The published fx-3650P II product image informs family-level proportions only; no photo is copied. The panel contains no CASIO logo, HKEAA approval wording, external images, or embedded remote resources.
- This variant imports the shared engine and LCD from `../fx-50fh-ii/js/`; it does not carry a second engine copy.

## Verification

Run the upstream engine suite and the fx-3650P ported regression suite with `npm test` from this directory. All verification is manual; no GitHub Actions workflow is included or dispatched.
