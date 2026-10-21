// The shared upstream hit targets are filtered and re-spaced for this model.
// The manual documents key functions and mode sequences, not faceplate pixel
// coordinates; this is a functional schematic keyboard rather than a product
// photograph or a claim of exact physical geometry.
import { KEYS as UPSTREAM_KEYS, SHELL_W, SHELL_H, PC_KEYS as UPSTREAM_PC_KEYS } from '../../fx-50fh-ii/js/keymap.js';

const FUNCTION_ROW_1 = new Set(['ABC', 'SQRT', 'SQR', 'POW', 'LOG', 'LN']);
const FUNCTION_ROW_2 = new Set(['NEG', 'DMS', 'HYP', 'SIN', 'COS', 'TAN']);
const FUNCTION_ROW_3 = new Set(['RCL', 'ENG', 'LPAR', 'RPAR', 'COMMA', 'MPLUS']);
const NUMERIC_ROW_Y = { N7: 1090, N8: 1090, N9: 1090, DEL: 1090, AC: 1090,
  N4: 1200, N5: 1200, N6: 1200, MUL: 1200, DIV: 1200,
  N1: 1310, N2: 1310, N3: 1310, ADD: 1310, SUB: 1310,
  N0: 1420, DOT: 1420, EXP: 1420, ANS: 1420, EXE: 1420 };

function modelKey(source) {
  if (source.id === 'PROG' || source.id === 'FMLA') return null;
  const key = { ...source };
  if (key.id === 'RECIP') { key.x = 124; key.y = 742; }
  else if (key.id === 'CUBE') { key.x = 230; key.y = 742; }
  else if (FUNCTION_ROW_1.has(key.id)) key.y = 830;
  else if (FUNCTION_ROW_2.has(key.id)) key.y = 920;
  else if (FUNCTION_ROW_3.has(key.id)) key.y = 1010;
  else if (NUMERIC_ROW_Y[key.id] !== undefined) key.y = NUMERIC_ROW_Y[key.id];
  if (key.id === 'N7') key.shift = '';
  return key;
}

export const KEYS = UPSTREAM_KEYS.map(modelKey).filter(Boolean);
export { SHELL_W, SHELL_H };

export const PC_KEYS = { ...UPSTREAM_PC_KEYS };
delete PC_KEYS.F2;
delete PC_KEYS.F3;
