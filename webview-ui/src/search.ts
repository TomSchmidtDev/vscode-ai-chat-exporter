// Port of the IntelliJ plugin's search engine (QueryParser.kt / SearchNode.kt /
// SearchMatcher.kt). Query syntax: words (implicit AND), "quoted phrases",
// AND / OR keywords (case-insensitive), parentheses. NOT is rejected.

// ─── AST ──────────────────────────────────────────────────────────────────────

export type SearchNode =
  | { kind: 'term'; value: string }
  | { kind: 'phrase'; value: string }
  | { kind: 'and'; left: SearchNode; right: SearchNode }
  | { kind: 'or'; left: SearchNode; right: SearchNode };

export class QueryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryParseError';
  }
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type TokenKind = 'WORD' | 'PHRASE' | 'AND' | 'OR' | 'LPAREN' | 'RPAREN' | 'EOF';
interface Token { kind: TokenKind; value: string }

function tokenize(raw: string): Token[] {
  const result: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '"') {
      const end = raw.indexOf('"', i + 1);
      if (end === -1) throw new QueryParseError('Unclosed quote');
      result.push({ kind: 'PHRASE', value: raw.slice(i + 1, end) });
      i = end + 1;
    } else if (c === '(') {
      result.push({ kind: 'LPAREN', value: '(' });
      i++;
    } else if (c === ')') {
      result.push({ kind: 'RPAREN', value: ')' });
      i++;
    } else {
      const start = i;
      while (i < raw.length && !/\s/.test(raw[i]) && raw[i] !== '(' && raw[i] !== ')' && raw[i] !== '"') {
        i++;
      }
      const word = raw.slice(start, i);
      const upper = word.toUpperCase();
      if (upper === 'AND') result.push({ kind: 'AND', value: word });
      else if (upper === 'OR') result.push({ kind: 'OR', value: word });
      else if (upper === 'NOT') throw new QueryParseError('NOT operator is not supported in v1');
      else result.push({ kind: 'WORD', value: word });
    }
  }
  result.push({ kind: 'EOF', value: '' });
  return result;
}

// ─── Parser (recursive descent; OR binds weaker than AND) ────────────────────

/** Returns the parsed AST, or null for empty/blank input. Throws QueryParseError on syntax errors. */
export function parseQuery(input: string): SearchNode | null {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = (): Token => tokens[pos];
  const consume = (): Token => tokens[pos++];

  function parseOr(): SearchNode {
    let node = parseAnd();
    while (peek().kind === 'OR') {
      consume();
      node = { kind: 'or', left: node, right: parseAnd() };
    }
    return node;
  }

  function parseAnd(): SearchNode {
    let node = parseAtom();
    for (;;) {
      const k = peek().kind;
      if (k === 'AND') {
        consume();
        node = { kind: 'and', left: node, right: parseAtom() };
      } else if (k === 'WORD' || k === 'PHRASE' || k === 'LPAREN') {
        node = { kind: 'and', left: node, right: parseAtom() }; // implicit AND
      } else {
        break;
      }
    }
    return node;
  }

  function parseAtom(): SearchNode {
    const t = peek();
    switch (t.kind) {
      case 'WORD':
        return { kind: 'term', value: consume().value };
      case 'PHRASE':
        return { kind: 'phrase', value: consume().value };
      case 'LPAREN': {
        consume();
        const inner = parseOr();
        if (peek().kind !== 'RPAREN') throw new QueryParseError("Expected closing ')'");
        consume();
        return inner;
      }
      default:
        throw new QueryParseError(`Unexpected token: '${t.value}'`);
    }
  }

  if (peek().kind === 'EOF') return null;
  const node = parseOr();
  if (peek().kind !== 'EOF') throw new QueryParseError(`Unexpected token: '${peek().value}'`);
  return node;
}

// ─── Matcher ──────────────────────────────────────────────────────────────────

/** Half-open range [start, end) into the searched text. */
export type MatchRange = [start: number, end: number];

export class SearchMatcher {
  constructor(private readonly root: SearchNode) {}

  /** Returns true if text satisfies the full query (case-insensitive). */
  matches(text: string): boolean {
    return evalNode(this.root, text.toLowerCase());
  }

  /**
   * Returns non-overlapping, sorted ranges where query terms appear.
   * Only call this when matches() returns true — ranges may otherwise
   * belong to only one branch of a failed AND.
   */
  matchRanges(text: string): MatchRange[] {
    return collectRanges(this.root, text.toLowerCase());
  }
}

function evalNode(node: SearchNode, lower: string): boolean {
  switch (node.kind) {
    case 'term':
    case 'phrase':
      return lower.includes(node.value.toLowerCase());
    case 'and':
      return evalNode(node.left, lower) && evalNode(node.right, lower);
    case 'or':
      return evalNode(node.left, lower) || evalNode(node.right, lower);
  }
}

function collectRanges(node: SearchNode, lower: string): MatchRange[] {
  switch (node.kind) {
    case 'term':
    case 'phrase':
      return mergeRanges(occurrences(lower, node.value.toLowerCase()));
    case 'and':
    case 'or':
      return mergeRanges([...collectRanges(node.left, lower), ...collectRanges(node.right, lower)]);
  }
}

function occurrences(text: string, term: string): MatchRange[] {
  if (term.length === 0) return [];
  const result: MatchRange[] = [];
  let from = 0;
  for (;;) {
    const idx = text.indexOf(term, from);
    if (idx === -1) break;
    result.push([idx, idx + term.length]);
    from = idx + 1;
  }
  return result;
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length === 0) return [];
  const sorted = ranges.map((r): MatchRange => [r[0], r[1]]).sort((a, b) => a[0] - b[0]);
  const out: MatchRange[] = [sorted[0]];
  for (const r of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

// ─── DOM highlighting ─────────────────────────────────────────────────────────

/**
 * Appends text to parent, wrapping the given ranges in <mark> elements.
 * DOM-based replacement for the IntelliJ buildHighlightedHtml (no innerHTML).
 * Ranges must be sorted and non-overlapping (as returned by matchRanges).
 */
export function appendHighlighted(parent: Node, text: string, ranges: MatchRange[]): void {
  if (ranges.length === 0) {
    parent.appendChild(document.createTextNode(text));
    return;
  }
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start >= text.length) break;
    if (start > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, start)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(start, end);
    parent.appendChild(mark);
    cursor = end;
  }
  if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
}
