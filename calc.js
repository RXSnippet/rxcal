'use strict';

/* ──────────────────────────────────────
   STATE
────────────────────────────────────── */
const state = {
  expression: '',
  result: '0',
  justEvaled: false,
  shiftOn: false,
  alphaOn: false,
  angleMode: 'DEG', // DEG | RAD | GRAD
  memory: 0,
  ans: 0,
  history: [],
  histIdx: -1,
  isOff: false,
  inError: false,
  autoCloseCount: 0,
};

/* ──────────────────────────────────────
   DOM REFS
────────────────────────────────────── */
const dispExpr   = document.getElementById('disp-expr');
const dispResult = document.getElementById('disp-result');
const dispInner  = document.getElementById('display-inner');
const dispStart  = document.getElementById('disp-startup');
const startText  = document.getElementById('startup-text');
const indShift   = document.getElementById('ind-shift');
const indAlpha   = document.getElementById('ind-alpha');
const indDeg     = document.getElementById('ind-deg');
const indRad     = document.getElementById('ind-rad');
const indGra     = document.getElementById('ind-gra');
const calculator = document.getElementById('calculator');
const indM       = document.getElementById('ind-mode');

/* ──────────────────────────────────────
   AUDIO (click sound)
────────────────────────────────────── */
let audioCtx = null;

function playClick() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.04, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3) * 0.3;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.5;
    src.connect(filter);
    filter.connect(audioCtx.destination);
    src.start();
  } catch (_) {}
}

/* ──────────────────────────────────────
   DISPLAY UPDATE
────────────────────────────────────── */
function updateDisplay() {
  dispExpr.textContent = state.expression || '';
  dispExpr.classList.toggle('active', !!state.expression);

  const res = state.result;
  dispResult.textContent = res;
  requestAnimationFrame(() => {
    dispExpr.scrollLeft = dispExpr.scrollWidth;
    dispResult.scrollLeft = dispResult.scrollWidth;
  });
  const len = res.length;
  dispResult.classList.remove('small', 'xsmall');
  if (len > 14) dispResult.classList.add('xsmall');
  else if (len > 10) dispResult.classList.add('small');

  // Indicators
  indShift.classList.toggle('active', state.shiftOn);
  indAlpha.classList.toggle('active', state.alphaOn);
  indM.classList.toggle('active', state.memory !== 0);

  indDeg.style.opacity = state.angleMode === 'DEG' ? '1' : '0.2';
  indRad.style.opacity = state.angleMode === 'RAD' ? '1' : '0.2';
  indGra.style.opacity = state.angleMode === 'GRAD' ? '1' : '0.2';

  dispInner.classList.toggle('error', state.inError);
}

/* ──────────────────────────────────────
   STARTUP ANIMATION
────────────────────────────────────── */
function runStartup() {
  dispStart.classList.remove('hidden');
  const msg = 'RUPAM fx-82MS';
  let i = 0;
  startText.textContent = '';

  const typeInterval = setInterval(() => {
    startText.textContent += msg[i++];
    if (i >= msg.length) {
      clearInterval(typeInterval);
      setTimeout(() => {
        dispStart.classList.add('hidden');
        state.result = '0';
        updateDisplay();
      }, 900);
    }
  }, 70);
}

/* ──────────────────────────────────────
   ANGLE CONVERSION HELPERS
────────────────────────────────────── */
function toRad(val) {
  if (state.angleMode === 'RAD') return val;
  if (state.angleMode === 'GRAD') return val * Math.PI / 200;
  return val * Math.PI / 180; // DEG
}

function fromRad(val) {
  if (state.angleMode === 'RAD') return val;
  if (state.angleMode === 'GRAD') return val * 200 / Math.PI;
  return val * 180 / Math.PI;
}

/* ──────────────────────────────────────
   TOKENIZER
────────────────────────────────────── */
const TOKEN_NUM   = 'NUM';
const TOKEN_OP    = 'OP';
const TOKEN_LPAREN = 'LP';
const TOKEN_RPAREN = 'RP';
const TOKEN_FUNC  = 'FUNC';
const TOKEN_END   = 'END';

function tokenize(expr) {
  const tokens = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // Skip whitespace
    if (ch === ' ') { i++; continue; }

    // Numbers (including scientific notation)
    if (/[\d.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[\d.E+\-]/.test(expr[i]) && !(tokens.length > 0 && expr[i] === '+' && expr[i-1] !== 'E') && !(tokens.length > 0 && expr[i] === '-' && expr[i-1] !== 'E')) {
        // Handle E notation
        if ((expr[i] === '+' || expr[i] === '-') && num.includes('E')) {
          num += expr[i++];
        } else if (expr[i] === '+' || expr[i] === '-') {
          break;
        } else {
          num += expr[i++];
        }
      }
      tokens.push({ type: TOKEN_NUM, val: parseFloat(num) });
      continue;
    }

    // Negative / unary minus: if − appears after operator or start or (
    if (ch === '−' || ch === '-') {
      const last = tokens[tokens.length - 1];
      if (!last || last.type === TOKEN_OP || last.type === TOKEN_LPAREN || last.type === TOKEN_FUNC) {
        tokens.push({ type: TOKEN_OP, val: 'neg', unary: true, prec: 7, rassoc: true });
      } else {
        tokens.push({ type: TOKEN_OP, val: '−', prec: 2 });
      }
      i++; continue;
    }

    // Operators
    if (ch === '+') { tokens.push({ type: TOKEN_OP, val: '+', prec: 2 }); i++; continue; }
    if (ch === '×') { tokens.push({ type: TOKEN_OP, val: '×', prec: 3 }); i++; continue; }
    if (ch === '÷') { tokens.push({ type: TOKEN_OP, val: '÷', prec: 3 }); i++; continue; }
    if (ch === '^') { tokens.push({ type: TOKEN_OP, val: '^', prec: 5, rassoc: true }); i++; continue; }
    if (ch === '(' ) { tokens.push({ type: TOKEN_LPAREN }); i++; continue; }
    if (ch === ')' ) { tokens.push({ type: TOKEN_RPAREN }); i++; continue; }
    if (ch === '%' ) { tokens.push({ type: TOKEN_OP, val: '%', prec: 4, unary: true }); i++; continue; }

    // Implicit multiplication before (
    // Functions
    const funcs = ['sin⁻¹','cos⁻¹','tan⁻¹','sinh⁻¹','cosh⁻¹','tanh⁻¹',
                   'sinh','cosh','tanh','sin','cos','tan',
                   'log','ln','√','∛','Abs','exp','Ans','π','e'];

    let matched = false;
    for (const fn of funcs) {
      if (expr.startsWith(fn, i)) {
        tokens.push({ type: TOKEN_FUNC, val: fn });
        i += fn.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Unknown — skip
    i++;
  }

  tokens.push({ type: TOKEN_END });
  return tokens;
}

/* ──────────────────────────────────────
   PARSER (Shunting-Yard / Recursive Descent hybrid)
────────────────────────────────────── */
function parseAndEval(expr) {
  // Replace special chars
  expr = expr
    .replace(/π/g, '(' + Math.PI + ')')
    .replace(/Ans/g, '(' + state.ans + ')')
    .replace(/e(?![xE])/g, '(' + Math.E + ')');

  const tokens = tokenize(expr);
  let pos = 0;

  function peek() { return tokens[pos]; }
  function consume() { return tokens[pos++]; }

  function parseExpr(minPrec = 0) {
    let left = parseUnary();

    while (true) {
      const tok = peek();
      if (tok.type !== TOKEN_OP) break;
      const op = tok;
      if (op.unary) break;
      const prec = op.prec;
      if (prec <= minPrec) break;
      consume();
      const nextMinPrec = op.rassoc ? prec - 1 : prec;
      const right = parseExpr(nextMinPrec);
      left = applyBinaryOp(op.val, left, right);
    }
    return left;
  }

  function parseUnary() {
    const tok = peek();
    if (tok.type === TOKEN_OP && tok.val === 'neg') {
      consume();
      return -parseUnary();
    }
    if (tok.type === TOKEN_OP && tok.val === '%') {
      consume();
      const val = parsePrimary();
      return val / 100;
    }
    let val = parsePrimary();

    // Postfix: x², x⁻¹, !, ×10ˣ, %
    while (true) {
      const t = peek();
      if (t.type === TOKEN_OP && t.val === '%') {
        consume();
        val = val / 100;
      } else {
        break;
      }
    }
    return val;
  }

  function parsePrimary() {
    const tok = peek();

    if (tok.type === TOKEN_NUM) {
      consume();
      return tok.val;
    }

    if (tok.type === TOKEN_LPAREN) {
      consume();
      const val = parseExpr(0);
      if (peek().type === TOKEN_RPAREN) consume();
      return val;
    }

    if (tok.type === TOKEN_FUNC) {
      consume();
      const fn = tok.val;

      if (fn === '√') {
        const arg = parsePrimary();
        if (arg < 0) throw new Error('Math ERROR');
        return Math.sqrt(arg);
      }
      if (fn === '∛') {
        const arg = parsePrimary();
        return Math.cbrt(arg);
      }

      // Functions with parenthesised arg
      let arg;
      if (peek().type === TOKEN_LPAREN) {
        consume();
        arg = parseExpr(0);
        if (peek().type === TOKEN_RPAREN) consume();
      } else {
        arg = parsePrimary();
      }

      return applyFunc(fn, arg);
    }

    // Implicit multiply: number followed by (
    if (tok.type === TOKEN_END) return 0;

    throw new Error('Syntax ERROR');
  }

  function applyFunc(fn, arg) {
    switch (fn) {
      case 'sin':   return Math.sin(toRad(arg));
      case 'cos':   return Math.cos(toRad(arg));
      case 'tan': {
        const r = toRad(arg);
        // tan(90°) guard
        if (Math.abs(Math.cos(r)) < 1e-12) throw new Error('Math ERROR');
        return Math.tan(r);
      }
      case 'sin⁻¹': if (Math.abs(arg) > 1) throw new Error('Math ERROR'); return fromRad(Math.asin(arg));
      case 'cos⁻¹': if (Math.abs(arg) > 1) throw new Error('Math ERROR'); return fromRad(Math.acos(arg));
      case 'tan⁻¹': return fromRad(Math.atan(arg));
      case 'sinh':  return Math.sinh(arg);
      case 'cosh':  return Math.cosh(arg);
      case 'tanh':  return Math.tanh(arg);
      case 'sinh⁻¹': return Math.asinh(arg);
      case 'cosh⁻¹': if (arg < 1) throw new Error('Math ERROR'); return Math.acosh(arg);
      case 'tanh⁻¹': if (Math.abs(arg) >= 1) throw new Error('Math ERROR'); return Math.atanh(arg);
      case 'log':   if (arg <= 0) throw new Error('Math ERROR'); return Math.log10(arg);
      case 'ln':    if (arg <= 0) throw new Error('Math ERROR'); return Math.log(arg);
      case 'Abs':   return Math.abs(arg);
      case 'exp':   return Math.exp(arg);
      default: throw new Error('Syntax ERROR');
    }
  }

  function applyBinaryOp(op, a, b) {
    switch (op) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': if (b === 0) throw new Error('Math ERROR'); return a / b;
      case '^': {
        if (a < 0 && !Number.isInteger(b)) throw new Error('Math ERROR');
        return Math.pow(a, b);
      }
      default: throw new Error('Syntax ERROR');
    }
  }

  try {
    const result = parseExpr(0);
    if (!isFinite(result)) throw new Error('Math ERROR');
    return result;
  } catch (e) {
    throw e;
  }
}

/* ──────────────────────────────────────
   NUMBER FORMATTER
────────────────────────────────────── */
function formatResult(val) {
  if (!isFinite(val)) return 'Math ERROR';
  if (val === 0) return '0';

  const abs = Math.abs(val);

  // Use scientific notation for very large/small
  if (abs !== 0 && (abs >= 1e10 || abs < 1e-9)) {
    const str = val.toExponential(9);
    // Clean up: remove trailing zeros in mantissa
    return str.replace(/(\.\d*?)0+(e)/, '$1$2').replace(/\.e/, 'e');
  }

  // Round to avoid floating point artefacts
  let str = parseFloat(val.toPrecision(10)).toString();

  // Limit display to 10 significant digits
  if (str.length > 12 && !str.includes('e')) {
    str = parseFloat(val.toPrecision(10)).toString();
  }

  return str;
}

/* ──────────────────────────────────────
   CALCULATE (=)
────────────────────────────────────── */
function calculate() {
  if (!state.expression) return;
  
  try {
    const val = parseAndEval(state.expression);
    const formatted = formatResult(val);
    state.history.push(state.expression);
    state.histIdx = state.history.length;
    state.ans = val;
    state.result = formatted;
    state.justEvaled = true;
    state.inError = false;
    state.autoCloseCount = 0;
    updateDisplay();
  } catch (err) {
    state.result = err.message || 'Math ERROR';
    state.inError = true;
    state.justEvaled = true;
    state.autoCloseCount = 0;
    updateDisplay();
    // Shake animation
    dispInner.classList.remove('shake');
    void dispInner.offsetWidth;
    dispInner.classList.add('shake');
    setTimeout(() => dispInner.classList.remove('shake'), 500);
  }
}

/* ──────────────────────────────────────
   APPEND TO EXPRESSION
────────────────────────────────────── */
function getAutoCloseInsertIndex() {
  if (state.autoCloseCount <= 0) return state.expression.length;

  let idx = state.expression.length;
  let remaining = state.autoCloseCount;
  while (remaining > 0 && state.expression[idx - 1] === ')') {
    idx--;
    remaining--;
  }

  if (remaining > 0) {
    state.autoCloseCount -= remaining;
    return state.expression.length;
  }

  return idx;
}

function insertExprText(str) {
  const idx = getAutoCloseInsertIndex();
  state.expression = state.expression.slice(0, idx) + str + state.expression.slice(idx);
  state.result = state.expression || '0';
}

function appendExpr(str, autoCloseCount = 0) {
  if (state.justEvaled) {
    // If user types a digit right after =, start fresh
    if (/^\d/.test(str)) {
      state.expression = str;
      state.autoCloseCount = autoCloseCount;
    } else if (str === '.' ) {
      state.expression = '0.';
      state.autoCloseCount = autoCloseCount;
    } else {
      // operator after result: use result as base
      if (!state.inError) {
        state.expression = state.ans.toString() + str;
      } else {
        state.expression = str;
      }
      state.autoCloseCount = autoCloseCount;
    }
    state.justEvaled = false;
    state.inError = false;
  } else {
    insertExprText(str);
    state.autoCloseCount += autoCloseCount;
  }
  state.result = state.expression;
  updateDisplay();
}

/* ──────────────────────────────────────
   PRIMARY ACTION HANDLER
────────────────────────────────────── */
function handlePrimaryAction(action, el) {
  if (state.isOff && action !== 'ac') return;

  // Shift secondary actions
  if (state.shiftOn) {
    const shifted = getShiftedAction(action, el);
    if (shifted !== null) {
      state.shiftOn = false;
      document.getElementById('calculator').classList.remove('shift-mode');
      document.querySelector('.btn-shift').classList.remove('active-mode');
      updateDisplay();
      handleAction(shifted, el);
      return;
    }
  }

  // Alpha secondary actions
  if (state.alphaOn) {
    const alphaed = getAlphaAction(action, el);
    if (alphaed !== null) {
      state.alphaOn = false;
      document.getElementById('calculator').classList.remove('alpha-mode');
      document.querySelector('.btn-alpha').classList.remove('active-mode');
      updateDisplay();
      handleAction(alphaed, el);
      return;
    }
  }

  switch (action) {
    case 'shift':
      state.shiftOn = !state.shiftOn;
      state.alphaOn = false;
      document.getElementById('calculator').classList.toggle('shift-mode', state.shiftOn);
      document.querySelector('.btn-shift').classList.toggle('active-mode', state.shiftOn);
      updateDisplay();
      break;

    case 'alpha':
      state.alphaOn = !state.alphaOn;
      state.shiftOn = false;
      document.getElementById('calculator').classList.toggle('alpha-mode', state.alphaOn);
      document.querySelector('.btn-alpha').classList.toggle('active-mode', state.alphaOn);
      updateDisplay();
      break;

    case 'mode':
      // Cycle angle mode
      const modes = ['DEG', 'RAD', 'GRAD'];
      const idx = modes.indexOf(state.angleMode);
      state.angleMode = modes[(idx + 1) % 3];
      updateDisplay();
      break;

    case 'digit': {
      const v = el.dataset.val;
      if (state.justEvaled && !state.inError) {
        state.expression = v;
        state.result = v;
        state.justEvaled = false;
        state.inError = false;
        state.autoCloseCount = 0;
      } else if (state.inError) {
        state.expression = v;
        state.result = v;
        state.justEvaled = false;
        state.inError = false;
        state.autoCloseCount = 0;
      } else {
        insertExprText(v);
      }
      updateDisplay();
      break;
    }

    case 'dot': {
      if (state.justEvaled || state.inError) {
        state.expression = '0.';
        state.justEvaled = false;
        state.inError = false;
        state.autoCloseCount = 0;
      } else if (!state.expression.includes('.')) {
        insertExprText(state.expression ? '.' : '0.');
      }
      state.result = state.expression;
      updateDisplay();
      break;
    }

    case 'op': {
      const op = el.dataset.val;
      if (state.inError) break;
      if (state.justEvaled) {
        state.expression = formatResult(state.ans) + op;
        state.justEvaled = false;
        state.autoCloseCount = 0;
      } else {
        insertExprText(op);
      }
      state.result = state.expression;
      updateDisplay();
      break;
    }

    case 'equals':
      calculate();
      break;

    case 'ac':
      if (state.isOff) {
        // Power on
        state.isOff = false;
        state.expression = '';
        state.result = '0';
        state.justEvaled = false;
        state.inError = false;
        state.autoCloseCount = 0;
        runStartup();
        return;
      }
      state.expression = '';
      state.result = '0';
      state.justEvaled = false;
      state.inError = false;
      state.autoCloseCount = 0;
      updateDisplay();
      break;

    case 'del':
      if (state.justEvaled || state.inError) break;
      if (state.autoCloseCount > 0) {
        const idx = getAutoCloseInsertIndex();
        if (idx > 0 && state.expression[idx - 1] === '(' && state.expression[idx] === ')') {
          state.expression = state.expression.slice(0, idx - 1) + state.expression.slice(idx + 1);
          state.autoCloseCount--;
        } else if (idx > 0) {
          state.expression = state.expression.slice(0, idx - 1) + state.expression.slice(idx);
        }
      } else {
        state.expression = state.expression.slice(0, -1);
      }
      if (!state.expression) state.result = '0';
      else state.result = state.expression;
      updateDisplay();
      break;

    case 'openParen':
      appendExpr('(');
      break;

    case 'closeParen':
      if (state.autoCloseCount > 0 && state.expression.endsWith(')')) {
        state.autoCloseCount--;
        state.result = state.expression;
        updateDisplay();
        break;
      }
      appendExpr(')');
      break;

    case 'comma':
      appendExpr(',');
      break;

    case 'sin':
      appendExpr('sin()', 1);
      break;
    case 'cos':
      appendExpr('cos()', 1);
      break;
    case 'tan':
      appendExpr('tan()', 1);
      break;

    case 'log':
      appendExpr('log()', 1);
      break;
    case 'ln':
      appendExpr('ln()', 1);
      break;

    case 'sqrt':
      appendExpr('√()', 1);
      break;

    case 'sq': {
      if (state.expression && !state.justEvaled) {
        insertExprText('^2');
      } else if (state.justEvaled) {
        state.expression = formatResult(state.ans) + '^2';
        state.justEvaled = false;
        state.autoCloseCount = 0;
      }
      updateDisplay();
      break;
    }

    case 'pow':
      appendExpr('^');
      break;

    case 'inv': {
      // x^-1
      if (state.justEvaled) {
        state.expression = formatResult(state.ans) + '^(-1)';
        state.justEvaled = false;
        state.autoCloseCount = 0;
      } else if (state.expression) {
        insertExprText('^(-1)');
      }
      state.result = state.expression;
      updateDisplay();
      break;
    }

    case 'percent':
      appendExpr('%');
      break;

    case 'nCr': {
      appendExpr('nCr(');
      break;
    }

    case 'exp10':
      appendExpr('×10^');
      break;

    case 'ans':
      appendExpr('Ans');
      break;

    case 'mplus': {
      if (state.justEvaled) {
        state.memory += state.ans;
      } else {
        try {
          const v = parseAndEval(state.expression);
          state.memory += v;
        } catch(_) {}
      }
      updateDisplay();
      break;
    }

    case 'sto': {
      if (state.justEvaled) {
        state.memory = state.ans;
      } else {
        try {
          const v = parseAndEval(state.expression);
          state.memory = v;
        } catch(_) {}
      }
      updateDisplay();
      break;
    }

    case 'eng': {
      // Cycle through engineering notation
      break;
    }

    case 'up':
    case 'replay': {
      if (state.history.length === 0) break;
      state.histIdx = Math.max(0, state.histIdx - 1);
      state.expression = state.history[state.histIdx] || '';
      state.result = state.expression;
      state.justEvaled = false;
      state.inError = false;
      state.autoCloseCount = 0;
      updateDisplay();
      break;
    }

    case 'down': {
      if (state.histIdx < state.history.length - 1) {
        state.histIdx++;
        state.expression = state.history[state.histIdx];
        state.result = state.expression;
      } else {
        state.expression = '';
        state.result = '0';
        state.histIdx = state.history.length;
      }
      state.justEvaled = false;
      state.inError = false;
      state.autoCloseCount = 0;
      updateDisplay();
      break;
    }

    case 'left': {
      // Move cursor left – for now just shows in expression
      break;
    }

    case 'right': {
      break;
    }

    case 'solve':
    case 'calc': {
      // Simple evaluate current expression
      calculate();
      break;
    }
  }

  // Reset shift/alpha after action (except for shift/alpha themselves)
  if (action !== 'shift' && action !== 'alpha' && state.shiftOn) {
    state.shiftOn = false;
    document.getElementById('calculator').classList.remove('shift-mode');
    document.querySelector('.btn-shift').classList.remove('active-mode');
  }
  if (action !== 'shift' && action !== 'alpha' && state.alphaOn) {
    state.alphaOn = false;
    document.getElementById('calculator').classList.remove('alpha-mode');
    document.querySelector('.btn-alpha').classList.remove('active-mode');
  }
}

/* ──────────────────────────────────────
   SHIFT / ALPHA SECONDARY MAPS
────────────────────────────────────── */
function getShiftedAction(action, el) {
  const map = {
    'sin': 'asin',
    'cos': 'acos',
    'tan': 'atan',
    'log': 'pow10',
    'ln': 'exp',
    'sqrt': 'cbrt',
    'sq': 'cube',
    'inv': 'factorial',
    'openParen': 'abs',
    'ac': 'off',
    'exp10': 'pi',
    'ans': 'drg',
    'mplus': 'mminus',
    'sto': 'rcl',
  };
  return map[action] || null;
}

function getAlphaAction(action, el) {
  const map = {
    'exp10': 'euler',
  };
  return map[action] || null;
}

/* ──────────────────────────────────────
   EXTENDED ACTION HANDLER (overrides above; handles shift secondary + all actions)
────────────────────────────────────── */
// Save the inner core handler reference first, then redefine handleAction
// to also cover shift-derived and all primary actions in one unified function.
// (The outer definition below replaces the inner one above via hoisting.)

function handleAction(action, el) { // eslint-disable-line no-redeclare
  switch (action) {
    case 'asin': appendExpr('sin⁻¹()', 1); break;
    case 'acos': appendExpr('cos⁻¹()', 1); break;
    case 'atan': appendExpr('tan⁻¹()', 1); break;
    case 'pow10': appendExpr('10^()', 1); break;
    case 'exp': appendExpr('exp()', 1); break;
    case 'cbrt': appendExpr('∛()', 1); break;
    case 'cube': {
      if (state.expression) insertExprText('^3');
      else {
        state.expression = 'Ans^3';
        state.result = state.expression;
        state.autoCloseCount = 0;
      }
      updateDisplay();
      break;
    }
    case 'factorial': {
      // Append ! operator (we'll handle factorial specially)
      if (state.justEvaled) {
        // Calculate factorial of ans
        try {
          const n = Math.round(state.ans);
          if (n < 0 || n > 69) throw new Error('Math ERROR');
          let f = 1;
          for (let i = 2; i <= n; i++) f *= i;
          state.result = formatResult(f);
          state.ans = f;
          state.expression = '';
          updateDisplay();
        } catch(e) {
          state.result = e.message;
          state.inError = true;
          updateDisplay();
        }
      }
      break;
    }
    case 'abs': appendExpr('Abs()', 1); break;
    case 'off': {
      state.isOff = true;
      dispExpr.textContent = '';
      dispResult.textContent = '';
      updateDisplay();
      // Show dark display
      dispInner.style.background = '#8a9e75';
      break;
    }
    case 'pi': appendExpr('π'); break;
    case 'euler': appendExpr('e'); break;
    case 'drg': {
      const modes = ['DEG', 'RAD', 'GRAD'];
      const idx = modes.indexOf(state.angleMode);
      state.angleMode = modes[(idx + 1) % 3];
      updateDisplay();
      break;
    }
    case 'mminus': {
      if (state.justEvaled) {
        state.memory -= state.ans;
      } else {
        try {
          const v = parseAndEval(state.expression);
          state.memory -= v;
        } catch(_) {}
      }
      updateDisplay();
      break;
    }
    case 'rcl': {
      if (state.justEvaled || !state.expression) {
        state.expression = formatResult(state.memory);
        state.result = state.expression;
        state.justEvaled = false;
        state.autoCloseCount = 0;
      } else {
        insertExprText(formatResult(state.memory));
      }
      updateDisplay();
      break;
    }
    // Primary actions fall through to the top-level switch above
    default:
      handlePrimaryAction(action, el);
  }
}

/* ──────────────────────────────────────
   BUTTON EVENT LISTENERS
────────────────────────────────────── */
document.querySelectorAll('.btn[data-action]').forEach(btn => {
  const pressHandler = (e) => {
    e.preventDefault();
    if (state.isOff && btn.dataset.action !== 'ac') return;
    btn.classList.add('pressed');
    playClick();
    handlePrimaryAction(btn.dataset.action, btn);
  };

  const releaseHandler = () => {
    btn.classList.remove('pressed');
  };

  btn.addEventListener('pointerdown', pressHandler);
  btn.addEventListener('pointerup', releaseHandler);
  btn.addEventListener('pointerleave', releaseHandler);
});

/* ──────────────────────────────────────
   KEYBOARD SUPPORT
────────────────────────────────────── */
const keyMap = {
  '0': () => handlePrimaryAction('digit', { dataset: { val: '0' } }),
  '1': () => handlePrimaryAction('digit', { dataset: { val: '1' } }),
  '2': () => handlePrimaryAction('digit', { dataset: { val: '2' } }),
  '3': () => handlePrimaryAction('digit', { dataset: { val: '3' } }),
  '4': () => handlePrimaryAction('digit', { dataset: { val: '4' } }),
  '5': () => handlePrimaryAction('digit', { dataset: { val: '5' } }),
  '6': () => handlePrimaryAction('digit', { dataset: { val: '6' } }),
  '7': () => handlePrimaryAction('digit', { dataset: { val: '7' } }),
  '8': () => handlePrimaryAction('digit', { dataset: { val: '8' } }),
  '9': () => handlePrimaryAction('digit', { dataset: { val: '9' } }),
  '.': () => handlePrimaryAction('dot', {}),
  '+': () => handlePrimaryAction('op', { dataset: { val: '+' } }),
  '-': () => handlePrimaryAction('op', { dataset: { val: '−' } }),
  '*': () => handlePrimaryAction('op', { dataset: { val: '×' } }),
  '/': () => handlePrimaryAction('op', { dataset: { val: '÷' } }),
  '(': () => handlePrimaryAction('openParen', {}),
  ')': () => handlePrimaryAction('closeParen', {}),
  '^': () => handleAction('pow', {}),
  '%': () => handleAction('percent', {}),
  'Enter': () => handlePrimaryAction('equals', {}),
  '=': () => handlePrimaryAction('equals', {}),
  'Backspace': () => handlePrimaryAction('del', {}),
  'Escape': () => handlePrimaryAction('ac', {}),
  'Delete': () => handlePrimaryAction('ac', {}),
  'ArrowUp': () => handlePrimaryAction('up', {}),
  'ArrowDown': () => handlePrimaryAction('down', {}),
};

document.addEventListener('keydown', e => {
  const fn = keyMap[e.key];
  if (fn) {
    e.preventDefault();
    playClick();
    fn();
  }
});

function handlePrimaryAction_wrapper(action, el) {
  handlePrimaryAction(action, el);
}

/* ──────────────────────────────────────
   INIT
────────────────────────────────────── */
(function init() {
  dispInner.style.background = '';
  runStartup();
  updateDisplay();
})();
