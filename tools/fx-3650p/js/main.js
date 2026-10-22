// Thin fx-3650P interface over the shared upstream engine.
import { KEYS, SHELL_W, SHELL_H, PC_KEYS } from './keymap.js?v=appearance-2';
import { FX_3650P_CONFIG } from './model.js';
import { Machine } from '../../fx-50fh-ii/js/machine.js';
import { LCD, GLASS } from '../../fx-50fh-ii/js/lcd.js';

const shell = document.getElementById('shell');
const canvas = document.getElementById('lcd');
const accessibleDisplay = document.getElementById('lcd-accessible');
const modeChip = document.getElementById('mode-chip');
const hintEl = document.getElementById('key-hint');
const machine = new Machine(FX_3650P_CONFIG);
const lcd = new LCD(canvas);
const pct = (value, total) => `${(value / total) * 100}%`;
// Match the photographed model-family proportions; key ids, cap sizes and
// engine behavior remain unchanged.
const PANEL_GLASS = { x: 100, y: GLASS.y, w: 681, h: GLASS.h };
const KEY_X_CENTER = SHELL_W / 2;
const KEY_Y_ANCHOR = 500;
const keyPanelX = (key) => KEY_X_CENTER + (key.x + key.w / 2 - KEY_X_CENTER) * 1.18 - key.w / 2;
const keyPanelY = (key) => KEY_Y_ANCHOR + (key.y + key.h / 2 - KEY_Y_ANCHOR) * 1.08 - key.h / 2;

Object.assign(canvas.style, {
  left: pct(PANEL_GLASS.x, SHELL_W), top: pct(PANEL_GLASS.y, SHELL_H),
  width: pct(PANEL_GLASS.w, SHELL_W), height: pct(PANEL_GLASS.h, SHELL_H)
});

const buttons = new Map();
for (const key of KEYS) {
  const button = document.createElement('button');
  const functions = [
    key.shift && `SHIFT: ${key.shift}`,
    key.alpha && `ALPHA: ${key.alpha}`,
    key.basen && `BASE: ${key.basen}`,
    key.cmplx && `CMPLX: ${key.cmplx}`,
    key.stat && `statistics: ${key.stat}`,
    key.statShift && `statistics SHIFT: ${key.statShift}`,
    key.hex && `hexadecimal digit ${key.hex}`
  ].filter(Boolean);
  button.className = `key${key.kind ? ` ${key.kind}` : ''}${/^N[0-9]$/.test(key.id) ? ' numeric' : ''}${key.pad ? ' pad' : ''}${key.orange ? ' orange' : ''}${key.disabledReason ? ' unavailable' : ''}`;
  button.type = 'button';
  button.dataset.id = key.id;
  const label = `${key.base} key${functions.length ? `. ${functions.join('. ')}` : ''}${key.disabledReason ? `. Unavailable: ${key.disabledReason}` : ''}`;
  if (key.disabledReason) {
    button.dataset.disabledReason = key.disabledReason;
    button.setAttribute('aria-disabled', 'true');
  }
  button.setAttribute('aria-label', label);
  button.title = label;
  const base = document.createElement('span');
  base.className = 'key-base';
  base.textContent = key.base;
  base.setAttribute('aria-hidden', 'true');
  button.appendChild(base);
  for (const [field, name] of [
    ['shift', 'shift'], ['alpha', 'alpha'], ['basen', 'basen'],
    ['cmplx', 'cmplx'], ['stat', 'stat'], ['statShift', 'statShift'], ['hex', 'hex']
  ]) {
    if (!key[field]) continue;
    const legend = document.createElement('span');
    legend.className = `key-legend key-legend--${name}`;
    legend.textContent = key[field];
    legend.setAttribute('aria-hidden', 'true');
    button.appendChild(legend);
  }
  Object.assign(button.style, {
    left: pct(keyPanelX(key), SHELL_W), top: pct(keyPanelY(key), SHELL_H),
    width: pct(key.w, SHELL_W), height: pct(key.h, SHELL_H)
  });
  shell.appendChild(button);
  buttons.set(key.id, button);
}

let hintTimer;
function showHint(message, highlightMode = true) {
  hintEl.textContent = message;
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.remove('show'), 5600);
  if (highlightMode) {
    buttons.get('MODE')?.classList.add('attention');
    setTimeout(() => buttons.get('MODE')?.classList.remove('attention'), 1500);
  }
}

let dirty = true;
let blink = true;
let lastBlink = performance.now();
let lastNotice = 0;
let lastMode = '';
let lastAnnouncement = '';

function tap(id) {
  const button = buttons.get(id);
  if (button?.dataset.disabledReason) {
    showHint(button.dataset.disabledReason, false);
    return;
  }
  if (button) {
    button.classList.add('down');
    setTimeout(() => button.classList.remove('down'), 90);
  }
  machine.press(id);
  blink = true;
  lastBlink = performance.now();
  dirty = true;
}

modeChip.addEventListener('click', () => tap('MODE'));
let lastPointer = 0;
shell.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('.key');
  if (!button) return;
  event.preventDefault();
  lastPointer = performance.now();
  tap(button.dataset.id);
});
shell.addEventListener('click', (event) => {
  const button = event.target.closest('.key');
  if (!button || performance.now() - lastPointer < 700) return;
  tap(button.dataset.id);
});

window.addEventListener('keydown', (event) => {
  if (event.target instanceof Element && event.target.closest('textarea, input, select, [contenteditable="true"]')) return;
  const unavailableButton = event.target instanceof Element
    ? event.target.closest('.key[aria-disabled="true"]')
    : null;
  if (unavailableButton) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tap(unavailableButton.dataset.id);
    }
    return;
  }
  if (event.metaKey || event.ctrlKey) return;
  let id = PC_KEYS[event.key];
  if (id === undefined && event.key.length === 1) id = PC_KEYS[event.key.toLowerCase()];
  if (id === undefined) return;
  event.preventDefault();
  if (id.startsWith('!')) { tap('SHIFT'); tap(id.slice(1)); }
  else tap(id);
});

const help = document.getElementById('help');
const helpToggle = document.getElementById('help-toggle');
helpToggle.addEventListener('click', () => {
  help.hidden = !help.hidden;
  helpToggle.setAttribute('aria-expanded', String(!help.hidden));
});

function describe(view) {
  const parts = [];
  const indicators = [...(view.indicators || [])];
  if (indicators.length) parts.push(`Indicators: ${indicators.join(', ')}`);
  if (view.line1 && view.line1.trim()) parts.push(`Upper display: ${view.line1.trim()}`);
  const lower = [view.left, view.line2].filter(Boolean).join(' ');
  if (lower) parts.push(`Lower display: ${lower}${view.exp ? ` times ten to ${view.exp}` : ''}`);
  return parts.join('. ') || 'Display blank';
}

function frame(now) {
  if (now - lastBlink > 480) { blink = !blink; lastBlink = now; dirty = true; }
  if (machine.notice && machine.notice.id !== lastNotice) {
    lastNotice = machine.notice.id;
    showHint(machine.notice.text);
  }
  const mode = `${machine.mode} · ${machine.setup.angle}`;
  if (mode !== lastMode) { modeChip.textContent = mode; lastMode = mode; }
  if (dirty) {
    const view = machine.view();
    view.blinkOn = blink;
    lcd.render(view);
    const announcement = describe(view);
    if (announcement !== lastAnnouncement) {
      accessibleDisplay.textContent = announcement;
      lastAnnouncement = announcement;
    }
    dirty = false;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
