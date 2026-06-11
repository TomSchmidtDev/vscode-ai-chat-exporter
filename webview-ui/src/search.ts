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
