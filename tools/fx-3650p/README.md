# fx-3650P — unofficial browser simulation

This is a model-specific profile over the shared MIT engine from
[`throwingogo-hub/fx-50fh-ii`](https://github.com/throwingogo-hub/fx-50fh-ii).
It loads the engine and LCD from `../fx-50fh-ii/js/`; there is no second copy
of the calculation engine.

**[Open the simulator →](index.html)**

The profile uses the official guide's mode list, 79-step input limit,
angle-specific trig ranges, and shared statistics/program memory rules. The
formula library and scientific-constants menu are disabled because they are
fx-50FH II additions. Differential and integration functions from the
fx-3650P guide are not implemented; the `∫dx` / `d/dx` key remains visible but
disabled. The panel is a hand-drawn approximation: the guide specifies key
operations but not pixel coordinates. A published fx-3650P II image informs
family-level proportions only; no product photo is used.

See [NOTICE](NOTICE.md) for the MIT provenance, manual references, declared
limits, and verification workflow.
