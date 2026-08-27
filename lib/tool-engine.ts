/**
 * Motor de herramientas locales de navegador (sin servidor, sin shell).
 * Reimplementa, de forma formativa y segura, varias capacidades del catálogo
 * de herramientas del deepseek-harness, todas ejecutadas 100% en el cliente.
 */

// ============================================================================
// 1) Evaluador matemático seguro (Pratt parser) — sin eval()
// ============================================================================

const MATH_FUNCTIONS: Record<string, (args: number[]) => number> = {
  sin: (a) => Math.sin(a[0]),
  cos: (a) => Math.cos(a[0]),
  tan: (a) => Math.tan(a[0]),
  asin: (a) => Math.asin(a[0]),
  acos: (a) => Math.acos(a[0]),
  atan: (a) => Math.atan(a[0]),
  atan2: (a) => Math.atan2(a[0], a[1]),
  sqrt: (a) => Math.sqrt(a[0]),
  cbrt: (a) => Math.cbrt(a[0]),
  abs: (a) => Math.abs(a[0]),
  log: (a) => Math.log10(a[0]),
  ln: (a) => Math.log(a[0]),
  exp: (a) => Math.exp(a[0]),
  round: (a) => Math.round(a[0]),
  floor: (a) => Math.floor(a[0]),
  ceil: (a) => Math.ceil(a[0]),
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  pow: (a) => Math.pow(a[0], a[1]),
  root: (a) => Math.pow(a[0], 1 / a[1]),
  hypot: (a) => Math.hypot(...a),
  sign: (a) => Math.sign(a[0]),
  clamp: (a) => Math.min(a[2], Math.max(a[1], a[0])),
};

const MATH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
};

type MathToken = { type: 'num' | 'op' | 'ident' | 'lparen' | 'rparen' | 'comma' | 'eof'; value: number | string };

class MathLexer {
  private s: string;
  private i = 0;
  constructor(input: string) {
    this.s = input.toLowerCase();
  }
  next(): MathToken {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
    if (this.i >= this.s.length) return { type: 'eof', value: '' };
    const ch = this.s[this.i];
    if (/[0-9.]/.test(ch)) {
      let j = this.i;
      while (j < this.s.length && /[0-9.]/.test(this.s[j])) j++;
      const raw = this.s.substring(this.i, j);
      const v = Number(raw);
      if (Number.isNaN(v)) throw new Error(`Número inválido: "${raw}"`);
      this.i = j;
      return { type: 'num', value: v };
    }
    if (/[a-z]/.test(ch)) {
      let j = this.i;
      while (j < this.s.length && /[a-z0-9_]/.test(this.s[j])) j++;
      const ident = this.s.substring(this.i, j);
      this.i = j;
      return { type: 'ident', value: ident };
    }
    this.i++;
    switch (ch) {
      case '(': return { type: 'lparen', value: ch };
      case ')': return { type: 'rparen', value: ch };
      case ',': return { type: 'comma', value: ch };
      case '+': case '-': case '*': case '/': case '^': case '%':
        return { type: 'op', value: ch };
      default: throw new Error(`Carácter inesperado: "${ch}"`);
    }
  }
}

class MathParser {
  private tok: MathToken = { type: 'eof', value: '' };
  constructor(private lexer: MathLexer) {
    this.tok = lexer.next();
  }
  private t(): MathToken { return this.tok; }
  private advance() { this.tok = this.lexer.next(); }
  private expect(type: MathToken['type'], what: string) {
    if (this.t().type !== type) throw new Error(`Se esperaba ${what}`);
    this.advance();
  }
  private precedence(op: string): number {
    switch (op) { case '+': case '-': return 1; case '*': case '/': case '%': return 2; case '^': return 3; default: return 0; }
  }
  parse(): number {
    if (this.t().type === 'eof') throw new Error('Expresión vacía');
    const v = this.parseExpr(0);
    if (this.t().type !== 'eof') throw new Error('Expresión inválida (¿paréntesis sin cerrar?)');
    return v;
  }
  private parseExpr(minPrec: number): number {
    let lhs = this.parseUnary();
    while (this.t().type === 'op' && this.precedence(String(this.t().value)) >= minPrec) {
      const op = String(this.t().value);
      const prec = this.precedence(op);
      this.advance();
      // '^' es asociativo por la derecha
      const rhs = this.parseExpr(op === '^' ? prec : prec + 1);
      switch (op) {
        case '+': lhs = lhs + rhs; break;
        case '-': lhs = lhs - rhs; break;
        case '*': lhs = lhs * rhs; break;
        case '/':
          if (rhs === 0) throw new Error('División entre cero');
          lhs = lhs / rhs; break;
        case '%': lhs = lhs % rhs; break;
        case '^': lhs = Math.pow(lhs, rhs); break;
      }
    }
    return lhs;
  }
  private parseUnary(): number {
    const t = this.t();
    if (t.type === 'op' && (t.value === '-' || t.value === '+')) {
      this.advance();
      const v = this.parseUnary();
      return t.value === '-' ? -v : v;
    }
    return this.parsePrimary();
  }
  private parsePrimary(): number {
    const t = this.t();
    if (t.type === 'num') { this.advance(); return t.value as number; }
    if (t.type === 'lparen') {
      this.advance();
      const v = this.parseExpr(0);
      this.expect('rparen', '")"');
      return v;
    }
    if (t.type === 'ident') {
      const name = String(t.value);
      this.advance();
      if (this.t().type === 'lparen') {
        this.advance();
        const args: number[] = [];
        if (this.t().type !== 'rparen') {
          args.push(this.parseExpr(0));
          while (this.t().type === 'comma') { this.advance(); args.push(this.parseExpr(0)); }
        }
        this.expect('rparen', '")"');
        const fn = MATH_FUNCTIONS[name];
        if (!fn) throw new Error(`Función desconocida: "${name}"`);
        return fn(args);
      }
      const c = MATH_CONSTANTS[name];
      if (c === undefined) throw new Error(`Constante desconocida: "${name}"`);
      return c;
    }
    throw new Error(`Token inesperado: "${t.value}"`);
  }
}

export function evaluateMath(expression: string): { ok: boolean; value?: number; error?: string } {
  try {
    const parser = new MathParser(new MathLexer(expression));
    const value = parser.parse();
    if (!Number.isFinite(value)) return { ok: false, error: 'El resultado no es un número finito' };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Expresión inválida' };
  }
}

// ============================================================================
// 2) Expresiones regulares
// ============================================================================

export function testRegex(pattern: string, flags: string, text: string): string {
  const re = new RegExp(pattern, flags);
  const matches: Array<{ full: string; groups: string[]; index: number }> = [];
  let m: RegExpExecArray | null;
  let guard = 0;
  const global = flags.includes('g');
  while ((m = re.exec(text)) !== null) {
    matches.push({ full: m[0], groups: m.slice(1), index: m.index });
    guard++;
    if (guard > 1000) break;
    if (!global) break;
  }
  const simple = new RegExp(pattern, flags.replace('g', ''));
  const isMatch = simple.test(text);
  const lines = [
    `¿Coincide? ${isMatch ? 'SÍ' : 'NO'}`,
    `Coincidencias encontradas: ${matches.length}`,
  ];
  for (const mt of matches) {
    lines.push(
      `\n#match@${mt.index}: "${truncate(mt.full, 120)}"` +
        (mt.groups.length ? `\n  grupos: [${mt.groups.map((g) => `"${truncate(g, 60)}"`).join(', ')}]` : '')
    );
  }
  return lines.join('\n');
}

// ============================================================================
// 3) Diff de texto (por líneas, LCS)
// ============================================================================

interface DiffLine {
  type: 'same' | 'add' | 'rem' | 'change';
  a?: string;
  b?: string;
}

export function lineDiff(aText: string, bText: string): string {
  const a = aText.replace(/\r\n/g, '\n').split('\n');
  const b = bText.replace(/\r\n/g, '\n').split('\n');
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines: string[] = ['Resultado del diff (líneas):', ''];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push(`  ${truncate(a[i], 200)}`);
      i++; j++;
    } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) {
      lines.push(`+ ${truncate(b[j], 200)}`);
      j++;
    } else {
      lines.push(`- ${truncate(a[i], 200)}`);
      i++;
    }
  }
  return lines.join('\n');
}

// ============================================================================
// 4) Mini motor SQL en memoria (subconjunto)
// ============================================================================

interface SQLTable {
  name: string;
  columns: { name: string; type: string }[];
  rows: string[][];
}

export function runSQL(script: string): string {
  const tables: Record<string, SQLTable> = {};
  const stmts = script
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const output: string[] = [];

  for (const stmt of stmts) {
    const upper = stmt.toUpperCase();
    if (upper.startsWith('CREATE TABLE')) {
      const rest = stmt.slice('CREATE TABLE'.length).trim();
      const open = rest.indexOf('(');
      const close = rest.lastIndexOf(')');
      if (open === -1 || close === -1) throw new Error(`CREATE TABLE inválido: ${stmt}`);
      const name = rest.slice(0, open).trim().split(/\s+/)[0] || `t${Object.keys(tables).length + 1}`;
      const cols = rest.slice(open + 1, close).split(',').map((c) => c.trim());
      const columns = cols.map((c) => {
        const parts = c.split(/\s+/);
        return { name: parts[0], type: parts[1] || 'TEXT' };
      });
      tables[name] = { name, columns, rows: [] };
      output.push(`✓ Tabla "${name}" creada: (${columns.map((c) => c.name).join(', ')})`);
    } else if (upper.startsWith('INSERT INTO')) {
      const into = stmt.slice('INSERT INTO'.length).trim();
      const valuesIdx = into.toUpperCase().indexOf('VALUES');
      if (valuesIdx === -1) throw new Error(`INSERT inválido: ${stmt}`);
      const tableName = into.slice(0, valuesIdx).trim().split(/\s+/)[0];
      const table = tables[tableName];
      if (!table) throw new Error(`Tabla no encontrada: ${tableName}`);
      let valsStr = into.slice(valuesIdx + 'VALUES'.length).trim();
      let vals: string[] = [];
      if (valsStr.startsWith('(')) {
        const close = valsStr.indexOf(')');
        vals = valsStr.slice(1, close).split(',').map((v) => unquote(v.trim()));
      } else {
        vals = valsStr.split(',').map((v) => unquote(v.trim()));
      }
      if (vals.length !== table.columns.length) throw new Error(`Insert: se esperaban ${table.columns.length} valores, se dieron ${vals.length}`);
      table.rows.push(vals.map((v, idx) => coerce(v, table.columns[idx].type)));
      output.push(`✓ Insertado en "${tableName}": ${vals.join(', ')}`);
    } else if (upper.startsWith('SELECT')) {
      const parsed = parseSelect(stmt, tables);
      output.push(renderSelectResult(parsed));
    } else if (upper.startsWith('SHOW TABLES')) {
      output.push(`Tablas disponibles: ${Object.keys(tables).join(', ') || '(ninguna)'}`);
    } else {
      output.push(`! Comando no soportado (omitido): ${stmt.split(/\s+/)[0]}`);
    }
  }
  return output.join('\n');
}

function coerce(v: string, type: string): string {
  const t = type.toUpperCase();
  if (t === 'INT' || t === 'INTEGER' || t === 'NUMBER' || t === 'REAL' || t === 'FLOAT' || t === 'DOUBLE') {
    const n = Number(v);
    if (!Number.isNaN(n)) return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
    return v;
  }
  if (t === 'BOOL' || t === 'BOOLEAN') {
    if (/^(true|1|yes|sí)$/i.test(v)) return 'true';
    if (/^(false|0|no)$/i.test(v)) return 'false';
    return v;
  }
  return v;
}

function unquote(v: string): string {
  if (v.length >= 2 && ((v[0] === "'" && v[v.length - 1] === "'") || (v[0] === '"' && v[v.length - 1] === '"'))) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

interface SelectResult {
  table: SQLTable;
  columns: string[];
  rows: string[][];
  count: number;
}

function parseSelect(stmt: string, tables: Record<string, SQLTable>): SelectResult {
  const fromIdx = stmt.toUpperCase().indexOf(' FROM ');
  if (fromIdx === -1) throw new Error('SELECT requiere FROM');
  const selPart = stmt.slice('SELECT'.length, fromIdx).trim();
  const fromPart = stmt.slice(fromIdx + ' FROM '.length).trim();

  let whereClause: string | null = null;
  let orderBy: string | null = null;
  let limit: number | null = null;

  const uFrom = fromPart.toUpperCase();
  const whereIdx = uFrom.indexOf(' WHERE ');
  const orderIdx = uFrom.indexOf(' ORDER BY ');
  const limitIdx = uFrom.indexOf(' LIMIT ');

  let tableName = fromPart;
  if (whereIdx !== -1) { tableName = fromPart.slice(0, whereIdx).trim(); whereClause = fromPart.slice(whereIdx + ' WHERE '.length); }
  else if (orderIdx !== -1) { tableName = fromPart.slice(0, orderIdx).trim(); orderBy = fromPart.slice(orderIdx + ' ORDER BY '.length); }
  else if (limitIdx !== -1) { tableName = fromPart.slice(0, limitIdx).trim(); limit = Number(fromPart.slice(limitIdx + ' LIMIT '.length).trim()); }

  // separar order/limit dentro del where
  if (whereClause) {
    const o = whereClause.toUpperCase().indexOf(' ORDER BY ');
    const l = whereClause.toUpperCase().indexOf(' LIMIT ');
    if (o !== -1) { orderBy = whereClause.slice(o + ' ORDER BY '.length); whereClause = whereClause.slice(0, o).trim(); }
    if (l !== -1) { limit = Number(whereClause.slice(l + ' LIMIT '.length).trim()); whereClause = whereClause.slice(0, l).trim(); }
  }
  if (orderBy) {
    const l = orderBy.toUpperCase().indexOf(' LIMIT ');
    if (l !== -1) { limit = Number(orderBy.slice(l + ' LIMIT '.length).trim()); orderBy = orderBy.slice(0, l).trim(); }
  }

  const table = tables[tableName];
  if (!table) throw new Error(`Tabla no encontrada: "${tableName}"`);

  let resultRows = table.rows;
  if (whereClause) {
    resultRows = resultRows.filter((row) => evalWhere(whereClause, table.columns, row));
  }
  if (orderBy) {
    const sortCol = orderBy.trim().split(/\s+/)[0];
    const desc = /desc$/i.test(orderBy.trim());
    const colIdx = table.columns.findIndex((c) => c.name === sortCol);
    const cmp = (a: string[], b: string[]) => {
      const A = colIdx >= 0 ? Number(a[colIdx]) || a[colIdx] : a.join(' ');
      const B = colIdx >= 0 ? Number(b[colIdx]) || b[colIdx] : b.join(' ');
      if (typeof A === 'number' && typeof B === 'number') return A - B;
      return String(A).localeCompare(String(B));
    };
    resultRows = [...resultRows].sort(cmp);
    if (desc) resultRows.reverse();
  }
  if (limit !== null && limit >= 0) resultRows = resultRows.slice(0, limit);

  let columns = table.columns.map((c) => c.name);
  if (selPart.trim() !== '*' && !selPart.trim().toLowerCase().startsWith('count(')) {
    columns = selPart.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  }

  const groupCount = /count\s*\(\s*\*\s*\)/i.test(selPart);
  if (groupCount) {
    return { table, columns: ['count'], rows: [[String(resultRows.length)]], count: resultRows.length };
  }

  const projected = resultRows.map((row) => {
    if (columns.length === 1 && columns[0] === '*') return row;
    return columns.map((c) => {
      const idx = table.columns.findIndex((cc) => cc.name === c);
      return idx >= 0 ? row[idx] : '';
    });
  });

  return { table, columns, rows: projected, count: resultRows.length };
}

function evalWhere(where: string, columns: { name: string; type: string }[], row: string[]): boolean {
  // Soporta: col = val, col != val, col > val, col < val, col >= val, col <= val, col LIKE 'x%', AND, OR
  const tokens = where.split(/\s+(AND|OR)\s+/i);
  const results: boolean[] = [];
  const operators: Array<'AND' | 'OR'> = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      results.push(evalCondition(tokens[i].trim(), columns, row));
    } else {
      operators.push(tokens[i].toUpperCase() as 'AND' | 'OR');
    }
  }
  let result = results[0] ?? true;
  for (let i = 0; i < operators.length; i++) {
    if (operators[i] === 'AND') result = result && (results[i + 1] ?? true);
    else result = result || (results[i + 1] ?? false);
  }
  return result;
}

function evalCondition(cond: string, columns: { name: string; type: string }[], row: string[]): boolean {
  const m = cond.match(/^\s*([\w"']+)\s*(=+|!=|<>|>=|<=|>|<|LIKE)\s*(.+?)\s*$/i);
  if (!m) return true;
  const colName = m[1].replace(/["']/g, '');
  const op = m[2].toUpperCase();
  const rawVal = unquote(m[3].trim());
  const idx = columns.findIndex((c) => c.name === colName);
  if (idx === -1) return true;
  const cell = row[idx];
  const isNum = (v: string) => v !== '' && Number.isFinite(Number(v));
  const a: number | string = isNum(cell) ? Number(cell) : cell;
  const b: number | string = isNum(rawVal) ? Number(rawVal) : rawVal;
  const cmp = (x: number | string, y: number | string): number =>
    typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));

  switch (op) {
    case '=': case '==': return a === b;
    case '!=': case '<>': return a !== b;
    case '>': return cmp(a, b) > 0;
    case '<': return cmp(a, b) < 0;
    case '>=': return cmp(a, b) >= 0;
    case '<=': return cmp(a, b) <= 0;
    case 'LIKE': {
      const esc = rawVal.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
      return new RegExp(`^${esc}$`).test(String(cell));
    }
    default: return true;
  }
}

function renderSelectResult(res: SelectResult): string {
  const header = res.columns.length === 1 && res.columns[0] === '*' ? res.table.columns.map((c) => c.name) : res.columns;
  const lines: string[] = [];
  lines.push(`# ${res.table.name} — ${res.count} fila(s)${res.count === 1 ? '' : 's'}`);
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  const shown = res.rows.slice(0, 100);
  for (const r of shown) {
    lines.push(`| ${r.map((c) => truncate(String(c ?? ''), 40)).join(' | ')} |`);
  }
  if (res.rows.length > 100) lines.push(`…y ${res.rows.length - 100} más (mostrando 100)`);
  return lines.join('\n');
}

// ============================================================================
// 5) JWT decode
// ============================================================================

export function decodeJWT(token: string): string {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return 'Token JWT inválido: se esperaban 3 segmentos (header.payload.signature).';
  const b64url = (s: string) => {
    try {
      const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    } catch {
      return '(segmento no decodificable)';
    }
  };
  let header: string, payload: string;
  try { header = JSON.stringify(JSON.parse(b64url(parts[0])), null, 2); }
  catch { header = b64url(parts[0]); }
  try { payload = JSON.stringify(JSON.parse(b64url(parts[1])), null, 2); }
  catch { payload = b64url(parts[1]); }

  const expMatch = (payload.match(/"exp"\s*:\s*(\d+)/) || [])[1];
  const expNote = expMatch
    ? `\n\nExpiración: ${new Date(Number(expMatch) * 1000).toLocaleString()}${Number(expMatch) * 1000 < Date.now() ? ' (EXPIRADO)' : ''}`
    : '';
  const iatMatch = (payload.match(/"iat"\s*:\s*(\d+)/) || [])[1];
  const iatNote = iatMatch ? `\nEmitido: ${new Date(Number(iatMatch) * 1000).toLocaleString()}` : '';

  return `HEADER\n${header}\n\nPAYLOAD\n${payload}${iatNote}${expNote}\n\nSIGNATURE (firma, no verificada localmente)\n${parts[2]}`;
}

// ============================================================================
// 6) CSV <-> JSON
// ============================================================================

export function csvToJSON(text: string, delimiter = ','): string {
  const rows = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  if (rows.length === 0) return '[]';
  const parseRow = (row: string) => {
    const out: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (inQ) {
        if (c === '"' && row[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === delimiter) { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = parseRow(rows[0]).map((h) => h.trim());
  const data = rows.slice(1).map(parseRow);
  const arr = data.map((cols) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h || `col_${i + 1}`] = cols[i] ?? ''; });
    return obj;
  });
  return JSON.stringify(arr, null, 2);
}

export function jsonToCSV(text: string): string {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return '';
  const keys = Array.from(new Set(arr.flatMap((o: Record<string, unknown>) => Object.keys(o))));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [keys.map(esc).join(',')];
  for (const o of arr) {
    lines.push(keys.map((k) => esc((o as Record<string, unknown>)[k])).join(','));
  }
  return lines.join('\n');
}

// ============================================================================
// 7) UUID
// ============================================================================

export function generateUUIDs(count: number, uppercase = false): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.max(1, count); i++) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    let uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    if (uppercase) uuid = uuid.toUpperCase();
    out.push(uuid);
  }
  return out;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
