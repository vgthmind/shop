// Minimal Liquid-subset engine: just enough of the real BigCartel theme
// templates (layout.html, home.html, products.html, product.html,
// contact.html, cart.html, infos-conditions-generales.html) to render them
// with our own catalog data, without depending on BigCartel at runtime.
//
// Implements only the tags/filters actually used by those templates (see
// `generator/README.md` for how that list was produced) - this is not a
// general-purpose Liquid implementation.

'use strict';

// ---------- Tokenizer ----------
// Splits the template into a flat list of {type, ...} tokens:
//   {type:'text', value}
//   {type:'output', expr, trimLeft, trimRight}
//   {type:'tag', name, args, trimLeft, trimRight}

const TAG_RE = /\{%-?\s*(\w+)([\s\S]*?)-?%\}/g;
const OUT_RE = /\{\{-?\s*([\s\S]*?)\s*-?\}\}/g;

function tokenize(src) {
  const tokens = [];
  const combined = /\{%-?\s*(\w+)([\s\S]*?)-?%\}|\{\{-?\s*([\s\S]*?)\s*-?\}\}/g;
  let last = 0;
  let m;
  while ((m = combined.exec(src))) {
    if (m.index > last) tokens.push({ type: 'text', value: src.slice(last, m.index) });
    const raw = m[0];
    const trimLeft = raw.startsWith('{%-') || raw.startsWith('{{-');
    const trimRight = raw.endsWith('-%}') || raw.endsWith('-}}');
    if (m[1] !== undefined) {
      tokens.push({ type: 'tag', name: m[1], args: m[2].trim(), trimLeft, trimRight });
    } else {
      tokens.push({ type: 'output', expr: m[3].trim(), trimLeft, trimRight });
    }
    last = combined.lastIndex;
  }
  if (last < src.length) tokens.push({ type: 'text', value: src.slice(last) });
  // Apply whitespace trimming ({%- ... -%}) against neighboring text tokens.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if ((t.type === 'tag' || t.type === 'output')) {
      if (t.trimLeft && i > 0 && tokens[i - 1].type === 'text') tokens[i - 1].value = tokens[i - 1].value.replace(/[ \t\r\n]+$/, '');
      if (t.trimRight && i < tokens.length - 1 && tokens[i + 1].type === 'text') tokens[i + 1].value = tokens[i + 1].value.replace(/^[ \t\r\n]+/, '');
    }
  }
  return tokens;
}

const BLOCK_OPENERS = new Set(['if', 'unless', 'for', 'case', 'capture', 'comment', 'paginate']);
const BLOCK_CLOSERS = {
  if: 'endif', unless: 'endunless', for: 'endfor', case: 'endcase',
  capture: 'endcapture', comment: 'endcomment', paginate: 'endpaginate'
};
const MID_TAGS = new Set(['else', 'elsif', 'when', 'break', 'continue']);

// ---------- Parser: flat tokens -> tree of nodes ----------
// Node shapes:
//  {type:'text', value}
//  {type:'output', expr}
//  {type:'if', branches:[{cond, body}], elseBody}
//  {type:'unless', cond, body, elseBody}
//  {type:'for', varName, collExpr, modifiers, body}
//  {type:'case', expr, whens:[{values, body}], elseBody}
//  {type:'capture', varName, body}
//  {type:'comment'}
//  {type:'assign', varName, expr}
//  {type:'paginate', collExpr, perPage, body}
//  {type:'break'}

function parse(tokens) {
  let pos = 0;
  function peek() { return tokens[pos]; }
  function next() { return tokens[pos++]; }

  function parseNodes(stopNames) {
    const nodes = [];
    while (pos < tokens.length) {
      const t = peek();
      if (t.type === 'tag' && stopNames && stopNames.has(t.name)) break;
      if (t.type === 'text') { nodes.push({ type: 'text', value: t.value }); next(); continue; }
      if (t.type === 'output') { nodes.push({ type: 'output', expr: t.expr }); next(); continue; }
      // tag
      if (t.name === 'if') { nodes.push(parseIf()); continue; }
      if (t.name === 'unless') { nodes.push(parseUnless()); continue; }
      if (t.name === 'for') { nodes.push(parseFor()); continue; }
      if (t.name === 'case') { nodes.push(parseCase()); continue; }
      if (t.name === 'capture') { nodes.push(parseCapture()); continue; }
      if (t.name === 'comment') { nodes.push(parseComment()); continue; }
      if (t.name === 'paginate') { nodes.push(parsePaginate()); continue; }
      if (t.name === 'assign') { nodes.push({ type: 'assign', raw: t.args }); next(); continue; }
      if (t.name === 'break') { nodes.push({ type: 'break' }); next(); continue; }
      if (t.name === 'continue') { nodes.push({ type: 'continue' }); next(); continue; }
      // Unknown/unsupported tag: skip silently (keeps unrelated BigCartel
      // tags from crashing the whole render).
      next();
    }
    return nodes;
  }

  function parseIf() {
    next(); // 'if'
    const branches = [{ cond: peekArgsOfLastTag(), body: null }];
    branches[0].cond = tokens[pos - 1].args;
    let elseBody = null;
    branches[0].body = parseNodes(new Set(['elsif', 'else', 'endif']));
    while (peek().type === 'tag' && (peek().name === 'elsif' || peek().name === 'else')) {
      const tag = next();
      if (tag.name === 'elsif') {
        const body = parseNodes(new Set(['elsif', 'else', 'endif']));
        branches.push({ cond: tag.args, body });
      } else {
        elseBody = parseNodes(new Set(['endif']));
      }
    }
    if (peek() && peek().type === 'tag' && peek().name === 'endif') next();
    return { type: 'if', branches, elseBody };
  }
  function peekArgsOfLastTag() { return null; }

  function parseUnless() {
    const tag = next(); // 'unless'
    const body = parseNodes(new Set(['else', 'endunless']));
    let elseBody = null;
    if (peek() && peek().type === 'tag' && peek().name === 'else') { next(); elseBody = parseNodes(new Set(['endunless'])); }
    if (peek() && peek().type === 'tag' && peek().name === 'endunless') next();
    return { type: 'unless', cond: tag.args, body, elseBody };
  }

  function parseFor() {
    const tag = next(); // 'for'
    const body = parseNodes(new Set(['endfor']));
    if (peek() && peek().type === 'tag' && peek().name === 'endfor') next();
    return { type: 'for', raw: tag.args, body };
  }

  function parseCase() {
    const tag = next(); // 'case'
    const expr = tag.args;
    const whens = [];
    let elseBody = null;
    // skip to first 'when' (there may be stray text/whitespace)
    parseNodes(new Set(['when', 'else', 'endcase']));
    while (peek() && peek().type === 'tag' && peek().name === 'when') {
      const w = next();
      const body = parseNodes(new Set(['when', 'else', 'endcase']));
      whens.push({ raw: w.args, body });
    }
    if (peek() && peek().type === 'tag' && peek().name === 'else') { next(); elseBody = parseNodes(new Set(['endcase'])); }
    if (peek() && peek().type === 'tag' && peek().name === 'endcase') next();
    return { type: 'case', expr, whens, elseBody };
  }

  function parseCapture() {
    const tag = next(); // 'capture'
    const varName = tag.args.trim();
    const body = parseNodes(new Set(['endcapture']));
    if (peek() && peek().type === 'tag' && peek().name === 'endcapture') next();
    return { type: 'capture', varName, body };
  }

  function parseComment() {
    next();
    parseNodes(new Set(['endcomment']));
    if (peek() && peek().type === 'tag' && peek().name === 'endcomment') next();
    return { type: 'comment' };
  }

  function parsePaginate() {
    const tag = next(); // 'paginate'
    const body = parseNodes(new Set(['endpaginate']));
    if (peek() && peek().type === 'tag' && peek().name === 'endpaginate') next();
    return { type: 'paginate', raw: tag.args, body };
  }

  const nodes = parseNodes(null);
  return nodes;
}

// ---------- Expression evaluation ----------

function splitFilters(expr) {
  // Split on top-level '|' (not inside quotes)
  const parts = [];
  let cur = '';
  let q = null;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '|') { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map((s) => s.trim());
}

const BLANK = Symbol('blank'); // see compare(): null/undefined/''/[] all == blank

function parseLiteral(tok) {
  tok = tok.trim();
  if (tok === '') return undefined;
  if (tok === 'true') return true;
  if (tok === 'false') return false;
  if (tok === 'nil' || tok === 'null') return null;
  if (tok === 'blank' || tok === 'empty') return BLANK;
  if (/^-?\d+(\.\d+)?$/.test(tok)) return parseFloat(tok);
  if ((tok[0] === '"' && tok[tok.length - 1] === '"') || (tok[0] === "'" && tok[tok.length - 1] === "'")) {
    return tok.slice(1, -1);
  }
  return undefined; // means "treat as variable path"
}

function resolvePath(path, ctx) {
  const lit = parseLiteral(path);
  if (lit !== undefined) return lit;
  // support forloop.index, product.images.size, t['products.sold_out'], t.products.sold_out
  const bracketMatch = path.match(/^([a-zA-Z_][\w]*)\[(['"])([^'"]*)\2\]$/);
  let root = path;
  let rest = [];
  if (bracketMatch) {
    root = bracketMatch[1];
    // t['navigation.products']: the whole string is ONE key (flat
    // translation table), not a path - try it as-is first.
    const obj = lookupVar(root, ctx);
    if (obj && Object.prototype.hasOwnProperty.call(obj, bracketMatch[3])) return obj[bracketMatch[3]];
    rest = bracketMatch[3].split('.');
  } else {
    const segs = path.split('.');
    root = segs[0];
    rest = segs.slice(1);
  }
  let val = lookupVar(root, ctx);
  for (const seg of rest) {
    if (val === undefined || val === null) return undefined;
    if (seg === 'size' || seg === 'length') { val = Array.isArray(val) ? val.length : (typeof val === 'string' ? val.length : undefined); continue; }
    if (seg === 'first') { val = Array.isArray(val) ? val[0] : undefined; continue; }
    if (seg === 'last') { val = Array.isArray(val) ? val[val.length - 1] : undefined; continue; }
    val = val[seg];
  }
  return val;
}

function lookupVar(name, ctx) {
  for (let i = ctx.scopes.length - 1; i >= 0; i--) {
    if (Object.prototype.hasOwnProperty.call(ctx.scopes[i], name)) return ctx.scopes[i][name];
  }
  return undefined;
}

function setVar(name, value, ctx) {
  ctx.scopes[ctx.scopes.length - 1][name] = value;
}

function evalFilterArgExpr(s, ctx) {
  s = s.trim();
  const v = parseLiteral(s);
  if (v !== undefined) return v;
  return resolvePath(s, ctx);
}

// Filters that need a value from the render context (currently just
// product_image_url, to look up locally-downloaded image paths) declare the
// variable they need here, resolved through lookupVar/scopes like any other
// path, instead of every filter silently receiving the internal {scopes}
// context object as a trailing positional arg - that bit a 0-arg filter
// like `{{ category | link_to }}` once already (the raw ctx landed in
// link_to's optional `url` parameter instead of `undefined`, see
// generator/README.md), and bit product_image_url itself a second time
// (ctx.__imageMap is undefined on the {scopes} wrapper - the actual value
// lives in one of ctx.scopes - so the lookup always silently missed and
// every image fell back to its remote BigCartel URL).
const FILTERS_WANTING_CTX = { product_image_url: '__imageMap' };

function applyFilter(value, name, argsStr, ctx, filters) {
  const fn = filters[name];
  const args = argsStr ? splitArgs(argsStr).map((a) => evalFilterArgExpr(a, ctx)) : [];
  if (!fn) return value; // unknown filter: passthrough
  if (FILTERS_WANTING_CTX[name]) return fn(value, ...args, lookupVar(FILTERS_WANTING_CTX[name], ctx));
  return fn(value, ...args);
}

function splitArgs(s) {
  // split on top-level commas, respecting quotes and brackets
  const parts = [];
  let cur = '';
  let q = null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '[' || c === '(') depth++;
    if (c === ']' || c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts.map((s) => s.trim());
}

function evalOutputExpr(expr, ctx, filters) {
  const parts = splitFilters(expr);
  let base = parts[0].trim();
  let value = resolvePath(base, ctx);
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const colonIdx = p.indexOf(':');
    const fname = (colonIdx === -1 ? p : p.slice(0, colonIdx)).trim();
    const fargs = colonIdx === -1 ? '' : p.slice(colonIdx + 1).trim();
    value = applyFilter(value, fname, fargs, ctx, filters);
  }
  return value;
}

// ---------- Condition evaluation (if/unless/case-when) ----------

function tokenizeCond(s) {
  // very small tokenizer for: expr (== != > < >= <=) expr (and|or) ...
  const re = /\s*(==|!=|>=|<=|>|<|\band\b|\bor\b|\bcontains\b|"[^"]*"|'[^']*'|\S+)\s*/g;
  const out = [];
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

function evalCondition(s, ctx, filters) {
  if (!s || !s.trim()) return true;
  const toks = tokenizeCond(s);
  // Build sequence of operands/ops, evaluate left-to-right honoring and/or
  // (no real precedence needed for these templates: simple chains).
  let result = null;
  let pendingOp = null; // 'and' | 'or' for combining with previous result
  let i = 0;
  function readOperand() {
    let val = evalOutputExpr(toks[i], ctx, filters);
    i++;
    return val;
  }
  function readComparison() {
    let left = readOperand();
    if (i < toks.length && ['==', '!=', '>', '<', '>=', '<=', 'contains'].includes(toks[i])) {
      const op = toks[i]; i++;
      let right = readOperand();
      return compare(left, op, right);
    }
    return truthy(left);
  }
  while (i < toks.length) {
    const val = readComparison();
    if (pendingOp === 'and') result = result && val;
    else if (pendingOp === 'or') result = result || val;
    else result = val;
    if (i < toks.length && (toks[i] === 'and' || toks[i] === 'or')) { pendingOp = toks[i]; i++; } else break;
  }
  return !!result;
}

function truthy(v) {
  if (v === undefined || v === null || v === false) return false;
  if (v === '') return false;
  return true;
}

function isBlankValue(v) {
  if (v === null || v === undefined || v === '' || v === false) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function compare(left, op, right) {
  if (left === BLANK || right === BLANK) {
    const other = left === BLANK ? right : left;
    const eq = isBlankValue(other);
    return op === '!=' ? !eq : eq;
  }
  switch (op) {
    case '==': return left === right;
    case '!=': return !(left === right);
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    case '>=': return Number(left) >= Number(right);
    case '<=': return Number(left) <= Number(right);
    case 'contains':
      if (Array.isArray(left)) return left.includes(right);
      if (typeof left === 'string') return left.includes(String(right));
      return false;
  }
  return false;
}

// ---------- Renderer ----------

function renderNodes(nodes, ctx, filters, out) {
  for (const node of nodes) {
    renderNode(node, ctx, filters, out);
    if (ctx.__break) return;
  }
}

function renderNode(node, ctx, filters, out) {
  switch (node.type) {
    case 'text': out.push(node.value); return;
    case 'output': {
      const v = evalOutputExpr(node.expr, ctx, filters);
      if (v !== undefined && v !== null) out.push(String(v));
      return;
    }
    case 'comment': return;
    case 'assign': {
      const eq = node.raw.indexOf('=');
      const name = node.raw.slice(0, eq).trim();
      const expr = node.raw.slice(eq + 1).trim();
      setVar(name, evalOutputExpr(expr, ctx, filters), ctx);
      return;
    }
    case 'capture': {
      const inner = [];
      ctx.scopes.push({});
      renderNodes(node.body, ctx, filters, inner);
      ctx.scopes.pop();
      setVar(node.varName, inner.join(''), ctx);
      return;
    }
    case 'if': {
      for (const b of node.branches) {
        if (evalCondition(b.cond, ctx, filters)) { renderNodes(b.body, ctx, filters, out); return; }
      }
      if (node.elseBody) renderNodes(node.elseBody, ctx, filters, out);
      return;
    }
    case 'unless': {
      if (!evalCondition(node.cond, ctx, filters)) renderNodes(node.body, ctx, filters, out);
      else if (node.elseBody) renderNodes(node.elseBody, ctx, filters, out);
      return;
    }
    case 'case': {
      const val = evalOutputExpr(node.expr, ctx, filters);
      for (const w of node.whens) {
        // supports "'a' or 'b'"
        const options = w.raw.split(/\s+or\s+/).map((s) => evalOutputExpr(s.trim(), ctx, filters));
        if (options.some((o) => o === val)) { renderNodes(w.body, ctx, filters, out); return; }
      }
      if (node.elseBody) renderNodes(node.elseBody, ctx, filters, out);
      return;
    }
    case 'for': {
      // raw: "item in collExpr [reversed] [limit: n] [offset: n]"
      const m = node.raw.match(/^(\w+)\s+in\s+([\s\S]+)$/);
      if (!m) return;
      const varName = m[1];
      let rest = m[2].trim();
      let reversed = false;
      if (/\breversed\b/.test(rest)) { reversed = true; rest = rest.replace(/\breversed\b/, '').trim(); }
      let limit = null, offset = 0;
      // limit:/offset: take a number OR a variable (real templates use
      // e.g. `limit: theme.nav_items`).
      const num = (v) => (/^\d+$/.test(v) ? parseInt(v, 10) : parseInt(resolvePath(v, ctx), 10));
      rest = rest.replace(/\blimit:\s*([\w.]+)/, (mm, n) => { limit = num(n); if (isNaN(limit)) limit = null; return ''; });
      rest = rest.replace(/\boffset:\s*([\w.]+)/, (mm, n) => { offset = num(n) || 0; return ''; });
      const collExpr = rest.trim();
      let coll = resolvePath(collExpr, ctx);
      if (!Array.isArray(coll)) coll = [];
      let items = coll.slice(offset);
      if (limit !== null) items = items.slice(0, limit);
      if (reversed) items = items.slice().reverse();
      const len = items.length;
      for (let idx = 0; idx < len; idx++) {
        ctx.scopes.push({
          [varName]: items[idx],
          forloop: { index: idx + 1, index0: idx, first: idx === 0, last: idx === len - 1, length: len, rindex: len - idx, rindex0: len - idx - 1 }
        });
        renderNodes(node.body, ctx, filters, out);
        const brk = ctx.__break;
        ctx.scopes.pop();
        if (brk) { ctx.__break = false; break; }
      }
      return;
    }
    case 'break': ctx.__break = true; return;
    case 'continue': return;
    case 'paginate': {
      // raw: "<var> from <collExpr> by <n>" - static site, so we bind <var>
      // to the FULL collection (no real pagination) and render one page.
      const m = node.raw.match(/^(\w+)\s+from\s+([\s\S]+?)\s+by\s+([\w.]+)/);
      const scope = { paginate: { pages: 1, current_page: 1, previous_page: null, next_page: null } };
      if (m) {
        const varName = m[1];
        const collExpr = m[2].trim();
        let coll = resolvePath(collExpr, ctx);
        // "by N" (number or variable, e.g. theme.featured_products on the
        // home page): BigCartel shows the first N - first page only here.
        const per = /^\d+$/.test(m[3]) ? parseInt(m[3], 10) : parseInt(resolvePath(m[3], ctx), 10);
        if (Array.isArray(coll) && per > 0) coll = coll.slice(0, per);
        scope[varName] = coll;
      }
      ctx.scopes.push(scope);
      renderNodes(node.body, ctx, filters, out);
      ctx.scopes.pop();
      return;
    }
  }
}

function render(templateSrc, data, filters) {
  const tokens = tokenize(templateSrc);
  const nodes = parse(tokens);
  const ctx = { scopes: [Object.assign({}, data)] };
  const out = [];
  renderNodes(nodes, ctx, filters, out);
  return out.join('');
}

module.exports = { render, tokenize, parse, evalOutputExpr, evalCondition };
