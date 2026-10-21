# fx-50FH II — unofficial web simulation

An unofficial browser simulation of the **fx-50FH II** based on the MIT-licensed
[`throwingogo-hub/fx-50fh-ii`](https://github.com/throwingogo-hub/fx-50fh-ii)
source. This project is not affiliated with CASIO or HKEAA. Check important
results against a physical calculator; see [NOTICE](NOTICE.md).

**[Open this calculator →](index.html)**

Program Studio includes a searchable, memory-aware **HKDSE Program Library**:
the seven programs from the printed S5 list plus five complex-number solvers
(simultaneous, line-circle, a combined one, quadratic and two-curve), six
four-slot packs, protected installs, one-step undo and versioned export/import
backup. The complete reference and
manual-copy source remains in [programs.md](programs.md). A matching bilingual,
print-ready edition is available as the
[curated S5 Program Library PDF](output/pdf/fx-50fh-ii-s5-program-library.pdf).

It is not a calculator app with a Casio skin. It is the fx-50FH II's own state
machine — its six modes, its two-line display, its 680 bytes of program memory,
its error messages — driven by the same key sequences you would press on the
physical unit. If the user's guide says `SHIFT 7 4 EXE`, that is what you press.

## What works

All six calculation modes, reachable with `MODE`:

| | Mode | |
|---|---|---|
| 1 | **COMP** | general computation |
| 2 | **CMPLX** | complex numbers, `a+bi` and `r∠θ` |
| 3 | **BASE** | base-n in dec / hex / bin / oct |
| 4 | **SD** | single-variable statistics |
| 5 | **REG** | paired-variable statistics, seven regression types |
| 6 | **PRGM** | four program areas sharing 680 bytes |

Everything the keyboard is printed with is implemented:

- **Arithmetic** with Casio's eleven-level priority sequence, implied
  multiplication, and omitted trailing parentheses.
- **Fractions** (`a b/c`, `d/c`) and **sexagesimal** values, each with the
  automatic result formatting the real machine applies, and the `a b/c` / `°′″`
  toggles between decimal and formatted display.
- **Trigonometric, hyperbolic, exponential and logarithmic** functions,
  including two-argument `log(m,n)`, `x√`, `∛`, `x!`, `Abs`, `Ran#`, `nPr`,
  `nCr`, `Rnd(`, `Pol(` and `Rec(` — with `Pol`/`Rec` writing their second
  result into `Y`, as they do on the unit.
- **Percent** in all six of the guide's forms, including `Ans − Ans × 20%`.
- **Complex numbers** — `i`, `a+bi` and `r∠θ` entry and display, `Conjg`,
  `Abs`, `arg`, `▶a+bi` and `▶r∠θ`, with the `R⇔I` symbol lit on every
  complex result and `Re⇔Im` (`SHIFT EXE`) toggling between the real part and
  the imaginary part `i` — or, in polar format, between `r` and `θ` under the
  `∠` symbol. In CMPLX the glass shows `CMPLX` at the top, and `ENG` alone
  types `i` (the red `ALPHA ENG` legend still works). Complex results keep
  Casio's precision: an integer power is
  repeated multiplication, so `i³` is `-i` and `(1+i)²` is `2i` with no
  trigonometric residue, right angles such as `5∠90` land exactly on an axis,
  and `√(-4)` is `2i`. As the guide requires, `√(`, `^(` and `∛(` work in
  CMPLX but refuse a complex argument, `sin`/`cos`/`tan`, `log`/`ln`, `x!`,
  `nPr` and `nCr` refuse complex arguments, `ENG` is unavailable in CMPLX,
  and the imaginary part of `Ans` is dropped on leaving the mode. Program
  variables hold complex values too, so a CMPLX program can prompt for `a+bi`
  and print a complex answer, with `SHIFT EXE` turning a paused answer over to
  its imaginary part.
- **Display settings** — `Fix`, `Sci`, `Norm1`/`Norm2`, `ENG` and `←ENG`,
  angle unit, fraction format, complex format, statistical frequency.
- **Memory** — `Ans`, independent memory `M`, and variables `A B C D X Y`.
- **40 scientific constants** and **23 built-in formulas**, the formulas
  prompting for each variable in turn and offering `LOOK`.
- **Base-n** with `d` `h` `b` `o` tags, `and`, `or`, `xor`, `xnor`, `Not(`,
  `Neg(`, and the real ten-digit binary and 32-bit decimal ranges.
- **Statistics** — the STAT data editor with back-step viewing and editing,
  frequency on or off, the whole `S-SUM` and `S-VAR` command set, `minX`,
  `maxX`, and estimated values for every regression type.
- **Programs** — `?`, `→`, `:`, `◢`, `Goto`/`Lbl`, `If`/`Then`/`Else`/`IfEnd`,
  `For`/`To`/`Step`/`Next`, `While`/`WhileEnd`, `Break`, the six relational
  operators, the setup commands, `ClrMemory`, `ClrStat`, `M+`, `M−`, `Rnd(`,
  `Dec`/`Hex`/`Bin`/`Oct` and `DT`. Program Studio adds normal copy/paste text,
  command insertion, byte and structure checks, direct run/edit controls, and
  automatic on-device recovery for all four slots—including active key-editor drafts.
  Its HKDSE Library searches by topic, previews inputs/outputs/examples, installs
  a program into an explicitly selected slot, confirms replacements, loads six
  memory-safe packs, and supports one-step undo plus versioned backup/restore.
- **Errors** — `Math`, `Syntax`, `Stack`, `Arg`, `Go`, `Nesting`, `Memory` and
  `Data Full`,
  and pressing `◄` or `►` on an error jumps the cursor to the character that
  caused it.

## The display

The two-line LCD is drawn on a canvas rather than set in a web font, because
the fx-50FH II's two lines are not the same kind of display. The upper line is
a 5 × 7 dot matrix of 16 characters; the lower line is a row of ten large
seven-segment cells plus a two-digit exponent field. Both are drawn at the
geometry measured off the physical unit — 37 × 91 px digits on a 48.3 px pitch,
leaning about 3° to the right — so a rendered screen lines up with a photograph
of the real one.

## Running it

There is no build step and there are no runtime dependencies. From the
`math-lish/local-tools` repository root, start a static server:

```bash
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/tools/fx-50fh-ii/`. ES modules require HTTP;
they will not load from `file://`.

## Tests

424 checks, including the guide's CMPLX chapter and complex-number edge
cases, worked examples, operating limits, REPLAY/history
navigation, Program Studio text/recovery/backup, all seven S5 programs and
their documented examples, generated-guide parity, and exhaustive LCD menu-layout/glyph coverage derived from the user's guide, driven
through the machine by key sequence rather than by calling the maths directly —
so they exercise input, evaluation and formatting the way a person does.

```bash
npm test
```

`programs.catalog.json` is the source of truth for the executable library.
After changing it, run `npm run generate:programs`; `npm test` rejects stale
`programs.md` or `js/program-catalog.generated.js` output. Run
`npm run generate:pdf` in an environment with ReportLab and the macOS CJK fonts
to rebuild the matching print edition.

## Keyboard

The physical keyboard is mapped: digits and operators are literal, `Enter` is
`EXE`, `Backspace` is `DEL`, `Escape` is `AC`, arrow keys drive `REPLAY`, and
`Space` and `Tab` latch `SHIFT` and `ALPHA`. Everything else is clickable.

A mode chip under the keypad shows the current mode and opens the `MODE` menu
when clicked, and a key the current mode cannot use (for example `ALPHA ENG`,
which is `i`, outside CMPLX) explains itself in a short message instead of
doing nothing.

## Provenance and licensing

This adaptation is pinned to upstream commit
`84c53951d58e0ee890eae5fd96f248aefdc8db37`. Its original keyboard coordinates
and calculator engine are retained. The panel is newly drawn in
`assets/fx-50fh-ii-panel.svg` and CSS; all 50 interactive hit boxes keep their
upstream positions. The upstream raster images are not included. The exact
replacements are listed in [NOTICE](NOTICE.md).

Upstream source code is covered by the included [MIT LICENSE](LICENSE). The
calculator runs locally in the browser without remote scripts or runtime
network requests.
