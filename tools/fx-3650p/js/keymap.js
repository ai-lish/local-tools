// The shared upstream hit targets are filtered and re-spaced for this model.
// The manual documents key functions and mode sequences, not faceplate pixel
// coordinates; this is a functional schematic keyboard rather than a product
// photograph or a claim of exact physical geometry.
import { KEYS as UPSTREAM_KEYS, SHELL_W, SHELL_H, PC_KEYS as UPSTREAM_PC_KEYS } from '../../fx-50fh-ii/js/keymap.js';

const FUNCTION_ROW_1 = new Set(['ABC', 'SQRT', 'SQR', 'POW', 'LOG', 'LN']);
const FUNCTION_ROW_2 = new Set(['NEG', 'DMS', 'HYP', 'SIN', 'COS', 'TAN']);
const FUNCTION_ROW_3 = new Set(['RCL', 'ENG', 'LPAR', 'RPAR', 'COMMA', 'MPLUS']);
const NUMERIC_ROW_Y = { N7: 1148, N8: 1148, N9: 1148, DEL: 1148, AC: 1148,
  N4: 1263, N5: 1263, N6: 1263, MUL: 1263, DIV: 1263,
  N1: 1372, N2: 1372, N3: 1372, ADD: 1372, SUB: 1372,
  N0: 1491, DOT: 1491, EXP: 1491, ANS: 1491, EXE: 1491 };

function modelKey(source) {
  const key = { ...source };
  if (key.id === 'PROG') key.orange = false;
  if (key.id === 'FMLA') {
    key.id = 'INTEGRAL';
    key.base = '∫dx';
    key.shift = 'd/dx';
    key.orange = false;
    key.disabledReason = 'Differential and integration calculations are not implemented in this simulator.';
  }
  // Keep the four-key upper row: Prog, ∫dx, x⁻¹ and x³.
  if (FUNCTION_ROW_1.has(key.id)) key.y = 863;
  else if (FUNCTION_ROW_2.has(key.id)) key.y = 951;
  else if (FUNCTION_ROW_3.has(key.id)) key.y = 1052;
  if (NUMERIC_ROW_Y[key.id] !== undefined) key.y = NUMERIC_ROW_Y[key.id];
  if (key.id === 'N7') key.shift = '';
  return key;
}

export const KEYS = UPSTREAM_KEYS.map(modelKey).filter(Boolean);
export { SHELL_W, SHELL_H };

export const PC_KEYS = { ...UPSTREAM_PC_KEYS };
delete PC_KEYS.F3;
