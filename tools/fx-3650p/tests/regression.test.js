import test from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../../fx-50fh-ii/js/machine.js';
import { C, CalcError } from '../../fx-50fh-ii/js/expr.js';
import { tok } from '../../fx-50fh-ii/js/tokens.js';
import { FX_3650P_CONFIG } from '../js/model.js';

const MAX_MAGNITUDE = 9.999999999e99;

function syntaxError() { throw new CalcError('Syntax'); }

function expressionTokens(source) {
  const lexemes = [];
  let offset = 0;
  const numberPattern = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
  const wordPattern = /^[A-Za-zπ]+/;
  while (offset < source.length) {
    if (/\s/.test(source[offset])) { offset++; continue; }
    const number = source.slice(offset).match(numberPattern);
    if (number) { lexemes.push({ type: 'number', value: number[0] }); offset += number[0].length; continue; }
    const word = source.slice(offset).match(wordPattern);
    if (word) { lexemes.push({ type: 'word', value: word[0] }); offset += word[0].length; continue; }
    if ('+-*/^()'.includes(source[offset])) { lexemes.push({ type: source[offset], value: source[offset] }); offset++; continue; }
    syntaxError();
  }

  let index = 0;
  const peek = () => lexemes[index];
  const take = (type) => {
    if (peek()?.type !== type) syntaxError();
    return lexemes[index++];
  };
  const parseAdd = () => {
    let node = parseMultiply();
    while (peek()?.type === '+' || peek()?.type === '-') {
      const operator = lexemes[index++].type;
      node = { type: 'binary', operator, left: node, right: parseMultiply() };
    }
    return node;
  };
  const parseMultiply = () => {
    let node = parseUnary();
    while (peek()?.type === '*' || peek()?.type === '/') {
      const operator = lexemes[index++].type;
      node = { type: 'binary', operator, left: node, right: parseUnary() };
    }
    return node;
  };
  const parseUnary = () => {
    if (peek()?.type === '-') { index++; return { type: 'neg', value: parseUnary() }; }
    if (peek()?.type === '+') syntaxError();
    return parsePower();
  };
  const parsePower = () => {
    const left = parseAtom();
    if (peek()?.type === '^') {
      index++;
      return { type: 'power', left, right: parseUnary() };
    }
    return left;
  };
  const functions = {
    sin: 'sin', cos: 'cos', tan: 'tan', asin: 'asin', acos: 'acos', atan: 'atan',
    sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', asinh: 'asinh', acosh: 'acosh', atanh: 'atanh',
    sqrt: 'sqrt', cbrt: 'cbrt', log: 'log', ln: 'ln', exp: 'expe', abs: 'Abs'
  };
  const constants = { pi: 'pi', π: 'pi', e: 'napier', ans: 'Ans', m: 'varM' };
  const parseAtom = () => {
    if (peek()?.type === 'number') return { type: 'number', value: take('number').value };
    if (peek()?.type === '(') {
      index++;
      const value = parseAdd();
      take(')');
      return { type: 'group', value };
    }
    if (peek()?.type !== 'word') syntaxError();
    const name = take('word').value.toLowerCase();
    if (functions[name]) {
      take('(');
      const value = parseAdd();
      take(')');
      return { type: 'function', name: functions[name], value };
    }
    if (constants[name]) return { type: 'constant', id: constants[name] };
    syntaxError();
  };

  const ast = parseAdd();
  if (index !== lexemes.length) syntaxError();
  const emit = (node) => {
    switch (node.type) {
      case 'number': {
        const match = node.value.match(/^(.+?)(?:[eE]([+-]?\d+))?$/);
        const out = [...match[1]].map((digit) => tok(digit));
        if (match[2] !== undefined) {
          out.push(tok('EXP'));
          if (match[2].startsWith('-')) out.push(tok('neg'));
          out.push(...[...match[2].replace(/^[+-]/, '')].map((digit) => tok(digit)));
        }
        return out;
      }
      case 'constant': return [tok(node.id)];
      case 'neg': return [tok('neg'), ...emit(node.value)];
      case 'group': return [tok('('), ...emit(node.value), tok(')')];
      case 'function': return [tok(node.name), ...emit(node.value), tok(')')];
      case 'power': return [...emit(node.left), tok('pow'), ...emit(node.right), tok(')')];
      case 'binary': {
        const id = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' }[node.operator];
        return [...emit(node.left), tok(id), ...emit(node.right)];
      }
      default: syntaxError();
    }
  };
  return emit(ast);
}

function machineFor({ angleMode, ans, memory } = {}) {
  const machine = new Machine(FX_3650P_CONFIG);
  if (angleMode) machine.setAngle({ DEG: 'Deg', RAD: 'Rad', GRA: 'Gra' }[angleMode] || angleMode);
  if (ans !== undefined) machine.ans = C(ans);
  if (memory !== undefined) machine.vars.M = memory;
  return machine;
}

function evaluateOn(machine, expression) {
  machine.tokens = expressionTokens(expression);
  machine.cursor = machine.tokens.length;
  machine.result = null;
  machine.error = null;
  machine.screen = 'input';
  machine.press('EXE');
  return machine;
}

function value(expression, options = {}) {
  const machine = evaluateOn(machineFor(options), expression);
  if (machine.error) throw new CalcError(machine.error);
  return machine.result.z.re;
}

function adjacentFloat(value, direction) {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const increment = Math.sign(value) === direction ? 1n : -1n;
  view.setBigUint64(0, bits + increment);
  return view.getFloat64(0);
}

test('four-operation precedence, parentheses, and left-to-right products', () => {
  assert.equal(value('5*(9+7)'), 80);
  assert.ok(Math.abs(value('3*(5*10^-9)') - 1.5e-8) < 1e-22);
  assert.equal(value('12+6/3'), 14);
  assert.equal(value('200/7*14'), 400);
});

test('power binds before unary minus and nests right-to-left', () => {
  assert.equal(value('-2^2'), -4);
  assert.equal(value('(-2)^2'), 4);
  assert.equal(value('2^3^2'), 512);
  assert.equal(value('2^-2'), 0.25);
  assert.equal(machineForError('0^0'), 'Math');
  assert.equal(machineForError('0^-1'), 'Math');
  assert.equal(value('0^1'), 0);
  assert.equal(value('M^2', { memory: -2 }), 4);
});

function machineForError(expression, options = {}) {
  return evaluateOn(machineFor(options), expression).error;
}

test('degree, radian, and gradian trig modes', () => {
  assert.ok(Math.abs(value('sin(30)', { angleMode: 'DEG' }) - 0.5) < 1e-12);
  assert.ok(Math.abs(value('cos(pi/3)', { angleMode: 'RAD' }) - 0.5) < 1e-12);
  assert.ok(Math.abs(value('sin(100)', { angleMode: 'GRA' }) - 1) < 1e-12);
  assert.ok(Math.abs(value('asin(sqrt(2)/2)', { angleMode: 'DEG' }) - 45) < 1e-12);
  assert.ok(Math.abs(value('acos(sqrt(2)/2)', { angleMode: 'DEG' }) - 45) < 1e-12);
  assert.ok(Math.abs(value('atan(1)', { angleMode: 'RAD' }) - Math.PI / 4) < 1e-12);
});

test('trig functions reduce large angles, reject tangent poles, and enforce E-50 ranges', () => {
  assert.ok(Math.abs(value('sin(9999990)', { angleMode: 'DEG' }) + 1) < 1e-12);
  assert.equal(machineForError('tan(9999990)', { angleMode: 'DEG' }), 'Math');
  assert.equal(machineForError('tan(9999900)', { angleMode: 'GRA' }), 'Math');
  assert.equal(machineForError('tan(pi/2)', { angleMode: 'RAD' }), 'Math');
  for (const expression of ['tan(1001*pi/2)', 'tan(-1001*pi/2)']) {
    assert.equal(machineForError(expression, { angleMode: 'RAD' }), 'Math');
  }
  const retained = machineFor({ angleMode: 'RAD', ans: 42 });
  evaluateOn(retained, 'tan(1001*pi/2)');
  assert.equal(retained.ans.re, 42);
  assert.equal(value('Ans', { angleMode: 'RAD', ans: 42 }), 42);
  const radianPole = value('1001*pi/2');
  for (const neighboringAngle of [
    adjacentFloat(radianPole, -1), adjacentFloat(radianPole, 1),
    adjacentFloat(-radianPole, -1), adjacentFloat(-radianPole, 1)
  ]) {
    assert.ok(Number.isFinite(value(`tan(${neighboringAngle})`, { angleMode: 'RAD' })));
  }
  assert.ok(Number.isFinite(value('tan(1001*pi/2+1e-6)', { angleMode: 'RAD' })));
  assert.ok(Number.isFinite(value('tan(1001*pi/2-1e-6)', { angleMode: 'RAD' })));
  assert.equal(machineForError('sin(4.5e10)', { angleMode: 'DEG' }), 'Math');
  assert.equal(machineForError('cos(785398165)', { angleMode: 'RAD' }), 'Math');
});

test('scientific functions and constants', () => {
  assert.equal(value('sqrt(81)+cbrt(8)'), 11);
  assert.equal(value('cbrt(-8)'), -2);
  assert.equal(value('log(1000)+ln(e)'), 4);
  assert.equal(value('exp(0)'), 1);
  assert.ok(Math.abs(value('exp(1)') - Math.E) < 1e-14);
  assert.equal(value('abs(-3.5)'), 3.5);
  assert.equal(value('e^0'), 1);
});

test('hyperbolic and inverse-hyperbolic functions', () => {
  assert.equal(value('sinh(0)'), 0);
  assert.equal(value('cosh(0)'), 1);
  assert.equal(value('tanh(0)'), 0);
  assert.equal(value('asinh(0)'), 0);
  assert.equal(value('acosh(1)'), 0);
  assert.equal(value('atanh(0)'), 0);
});

test('Ans and M values are supplied independently', () => {
  assert.equal(value('Ans+M', { ans: 12, memory: 3 }), 15);
  assert.ok(Math.abs(value('pi/2', { angleMode: 'RAD' }) - Math.PI / 2) < 1e-14);
  assert.equal(MAX_MAGNITUDE, FX_3650P_CONFIG.maxMagnitude);
  assert.equal(value('9e99'), 9e99);
  assert.equal(value('9.999999999e99'), MAX_MAGNITUDE);
  assert.ok(Math.abs(value('log(9e99)') - Math.log10(9e99)) < 1e-12);
  assert.equal(machineForError('M', { memory: 1e100 }), 'Math');
  assert.equal(machineForError('9.9999999991e99'), 'Math');
});

test('display fits ten mantissa cells and uses Norm1 scientific form', () => {
  const third = evaluateOn(machineFor(), '1/3').view();
  assert.equal(third.line2, '0.333333333');
  const small = evaluateOn(machineFor(), '1.5e-8').view();
  assert.equal(small.line2, '1.5');
  assert.equal(small.exp, '-08');
  const large = evaluateOn(machineFor(), '1e10').view();
  assert.equal(large.line2.replace(/\.$/, ''), '1');
  assert.equal(large.exp, '10');
});

test('domain and syntax errors are classified without evaluating input as code', () => {
  for (const expression of ['1/0', 'sqrt(-1)', 'log(0)', 'asin(2)', 'acos(2)', 'acosh(0)', 'atanh(1)', 'tan(90)']) {
    assert.equal(machineForError(expression), 'Math');
  }
  for (const expression of ['1+', '(2+3', '2(3)', 'globalThis.process.exit()']) {
    assert.throws(() => expressionTokens(expression), (error) => error instanceof CalcError && error.kind === 'Syntax');
  }
});

test('input and nesting limits are enforced', () => {
  const pressLiteral = (machine, char) => machine.press(({ '1': 'N1', '+': 'ADD' })[char]);
  const accepted = machineFor();
  for (const char of '1+'.repeat(39) + '1') pressLiteral(accepted, char);
  assert.equal(accepted.inputUsed(accepted.tokens), 79);
  assert.equal(value('1+'.repeat(39) + '1'), 40);
  const capped = machineFor();
  for (const char of '1+'.repeat(40) + '1') pressLiteral(capped, char);
  assert.equal(capped.inputUsed(capped.tokens), 79);
  assert.equal(FX_3650P_CONFIG.inputLimit.max, 79);
  const nested = evaluateOn(machineFor(), '('.repeat(25) + '1' + ')'.repeat(25));
  assert.equal(nested.error, 'Stack');
});

test('angle mode validation and the numeric overflow boundary are enforced', () => {
  assert.throws(() => machineFor().setAngle('TURN'), (error) => error instanceof CalcError && error.kind === 'Syntax');
  assert.equal(machineForError('1e100'), 'Math');
});

test('model modes, unsupported menus, and shared memory limits match the profile', () => {
  const machine = machineFor();
  machine.openModeMenu();
  assert.deepEqual(machine.config.modePages.flat(), ['COMP', 'CMPLX', 'BASE', 'SD', 'REG', 'PRGM', 'RUN', 'PCL']);
  assert.equal(machine.menu.keyMap[7].label, 'RUN');
  assert.equal(machine.menu.keyMap[8].label, 'PCL');
  machine.press('AC');
  assert.equal(machine.setMode('RUN'), true);
  assert.equal(machine.prog.stage, 'runpick');
  assert.equal(machine.setMode('PCL'), true);
  assert.equal(machine.prog.stage, 'delpick');
  assert.equal(machine.setMode('FMLA'), false);
  assert.equal(machine.programCapacity, 360);
  assert.equal(machine.statsMemoryAvailable(), 640);
  assert.equal(machine.programMemoryAvailable(), 360);
  machine.openPCmd(0);
  assert.equal(machine.menu.pages.length, 12);
  assert.ok(!machine.menu.pages.some((page) => page.items.some((item) => item.label === 'FreqOn' || item.label === 'FreqOff')));
  assert.equal(machine.config.features.formulas, false);
  assert.equal(machine.config.features.constants, false);
});

test('PRGM mode opens the editor menu and routes to an editable program', () => {
  const machine = machineFor();
  assert.equal(machine.setMode('PRGM'), undefined);
  assert.equal(machine.prog.stage, 'root');
  machine.press('N1');
  assert.equal(machine.prog.stage, 'editpick');
  machine.press('N1');
  assert.equal(machine.prog.stage, 'newmode');
  machine.press('N1');
  assert.equal(machine.prog.stage, 'edit');
  machine.press('N1');
  assert.equal(machine.prog.tokens.map((token) => token.s).join(''), '1');
});

test('statistical entries and program text obey the shared 640-byte store', () => {
  const machine = machineFor();
  machine.mode = 'SD';
  const enterValue = () => {
    machine.tokens = [tok('1')];
    machine.statEnter();
  };
  for (let i = 0; i < 32; i++) enterValue();
  assert.equal(machine.statsBytes(), 256);
  assert.equal(machine.programMemoryAvailable(), 360);

  machine.programs[0] = { tokens: Array.from({ length: 100 }, () => tok('1')) };
  assert.equal(machine.statsMemoryAvailable(), 516);
  assert.equal(machine.programMemoryAvailable(), 360);

  for (let i = 0; i < 32; i++) enterValue();
  assert.equal(machine.statsBytes(), 512);
  assert.equal(machine.programMemoryAvailable(), 104);
  assert.throws(enterValue, (error) => error instanceof CalcError && error.kind === 'Data Full');

  const frequency = machineFor();
  frequency.mode = 'SD';
  frequency.tokens = [tok('1'), tok(';'), tok('2')];
  frequency.statEnter();
  assert.equal(frequency.statsBytes(), 16);
});

test('program editor separator insertion cannot exceed the 360-byte limit', () => {
  const machine = machineFor();
  machine.setMode('PRGM');
  machine.press('N1');
  machine.press('N1');
  machine.press('N1');
  assert.equal(machine.prog.stage, 'edit');
  for (let i = 0; i < 360; i++) machine.press('EXE');
  assert.equal(machine.programBytes(), 360);
  machine.press('EXE');
  assert.equal(machine.error, 'Memory');
  assert.equal(machine.programBytes(), 360);
  assert.equal(machine.prog.tokens.length, 360);
});

test('editing a statistical frequency preserves the shared memory cap', () => {
  const machine = machineFor();
  machine.mode = 'SD';
  const enterValue = () => {
    machine.tokens = [tok('1')];
    machine.statEnter();
  };
  for (let i = 0; i < 80; i++) enterValue();
  assert.equal(machine.statsBytes(), 640);

  machine.openStatBrowse(79);
  machine.press('DOWN');
  machine.press('N2');
  machine.press('EXE');
  assert.equal(machine.error, 'Data Full');
  assert.equal(machine.stat.data[79].f, 1);
  assert.equal(machine.statsBytes(), 640);
});

test('creating or restoring a program reserves the manager bytes', () => {
  const machine = machineFor();
  machine.mode = 'SD';
  for (let i = 0; i < 80; i++) {
    machine.tokens = [tok('1')];
    machine.statEnter();
  }
  assert.equal(machine.statsBytes(), 640);

  machine.setMode('PRGM');
  machine.press('N1');
  machine.press('N1');
  machine.press('N1');
  assert.equal(machine.error, 'Memory');
  assert.equal(machine.programs[0], null);
  assert.equal(machine.restoreProgramSnapshot({ version: 1, slots: [{ mode: 'COMP', tokens: [] }] }), false);
  assert.throws(() => machine.setStudioProgram(0, 'COMP', []), /program memory exceeded/);
  assert.throws(() => machine.editProgramSlot(0), (error) => error instanceof CalcError && error.kind === 'Memory');
  assert.equal(machine.programs[0], null);
});

test('program M+ enforces the model numeric ceiling', () => {
  const machine = machineFor({ memory: MAX_MAGNITUDE });
  machine.setStudioProgram(0, 'COMP', ['1', 'EXP', '8', '9', 'pMplus']);
  machine.runProgram(0);
  assert.equal(machine.error, 'Math');
  assert.equal(machine.vars.M, MAX_MAGNITUDE);
});

test('statistical edit input obeys the 79-step model limit', () => {
  const machine = machineFor();
  machine.mode = 'SD';
  machine.tokens = [tok('1')];
  machine.statEnter();
  machine.openStatBrowse(0);
  for (let i = 0; i < 80; i++) machine.press('N1');
  assert.equal(machine.statBrowse.edit.length, 79);
});
