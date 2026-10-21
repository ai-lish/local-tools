// fx-3650P model profile for the shared MIT-licensed engine.
// Model-specific limits and mode labels are documented in NOTICE.md.
export const FX_3650P_CONFIG = Object.freeze({
  model: 'fx-3650P',
  modePages: [
    ['COMP', 'CMPLX', 'BASE'],
    ['SD', 'REG', 'PRGM'],
    ['RUN', 'PCL']
  ],
  inputLimit: { unit: 'steps', max: 79 },
  maxMagnitude: 9.999999999e99,
  maxMagnitudeInclusive: true,
  maxNesting: 24,
  zeroPowerZeroError: true,
  tanPoleStrategy: 'model-precision',
  trigInputLimits: {
    sin: {
      Deg: { max: 4.499999999e10, inclusive: true },
      Rad: { max: 785398163.3, inclusive: true },
      Gra: { max: 4.999999999e10, inclusive: true }
    },
    cos: {
      Deg: { max: 4.500000008e10, inclusive: true },
      Rad: { max: 785398164.9, inclusive: true },
      Gra: { max: 5.000000009e10, inclusive: true }
    },
    tan: {
      Deg: { max: 4.499999999e10, inclusive: true },
      Rad: { max: 785398163.3, inclusive: true },
      Gra: { max: 4.999999999e10, inclusive: true }
    }
  },
  programMemory: 360,
  statsMemory: {
    totalBytes: 640,
    statExclusiveBytes: 256,
    programManagerBytes: 24
  },
  features: {
    constants: false,
    formulas: false,
    setupFrequency: false,
    contrast: false,
    programs: true,
    retainStatData: true
  }
});
