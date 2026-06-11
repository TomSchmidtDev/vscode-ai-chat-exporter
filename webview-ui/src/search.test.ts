import { describe, it, expect } from 'vitest';
import { parseQuery, QueryParseError, SearchNode, SearchMatcher } from './search';

describe('parseQuery', () => {
  it('returns null for empty and blank input', () => {
    expect(parseQuery('')).toBeNull();
    expect(parseQuery('   ')).toBeNull();
  });

  it('parses a single word as a term', () => {
    expect(parseQuery('foo')).toEqual({ kind: 'term', value: 'foo' });
  });

  it('parses two words as implicit AND', () => {
    expect(parseQuery('foo bar')).toEqual({
      kind: 'and',
      left: { kind: 'term', value: 'foo' },
      right: { kind: 'term', value: 'bar' },
    });
  });

  it('parses explicit AND (case-insensitive keyword)', () => {
    const expected: SearchNode = {
      kind: 'and',
      left: { kind: 'term', value: 'foo' },
      right: { kind: 'term', value: 'bar' },
    };
    expect(parseQuery('foo AND bar')).toEqual(expected);
    expect(parseQuery('foo and bar')).toEqual(expected);
  });

  it('parses OR', () => {
    expect(parseQuery('foo OR bar')).toEqual({
      kind: 'or',
      left: { kind: 'term', value: 'foo' },
      right: { kind: 'term', value: 'bar' },
    });
  });

  it('gives AND higher precedence than OR', () => {
    // a OR b c  ≡  a OR (b AND c)
    expect(parseQuery('a OR b c')).toEqual({
      kind: 'or',
      left: { kind: 'term', value: 'a' },
      right: {
        kind: 'and',
        left: { kind: 'term', value: 'b' },
        right: { kind: 'term', value: 'c' },
      },
    });
  });

  it('parses quoted phrases verbatim (no keyword interpretation inside)', () => {
    expect(parseQuery('"hello AND world"')).toEqual({ kind: 'phrase', value: 'hello AND world' });
  });

  it('parses parentheses for grouping', () => {
    expect(parseQuery('(a OR b) c')).toEqual({
      kind: 'and',
      left: {
        kind: 'or',
        left: { kind: 'term', value: 'a' },
        right: { kind: 'term', value: 'b' },
      },
      right: { kind: 'term', value: 'c' },
    });
  });

  it('throws on unclosed quote', () => {
    expect(() => parseQuery('"abc')).toThrow(QueryParseError);
    expect(() => parseQuery('"abc')).toThrow('Unclosed quote');
  });

  it('throws on missing closing parenthesis', () => {
    expect(() => parseQuery('(a OR b')).toThrow("Expected closing ')'");
  });

  it('throws on stray closing parenthesis', () => {
    expect(() => parseQuery('a)')).toThrow(/Unexpected token/);
  });

  it('rejects NOT with a clear error', () => {
    expect(() => parseQuery('NOT foo')).toThrow('NOT operator is not supported in v1');
  });

  it('throws on dangling operator', () => {
    expect(() => parseQuery('foo AND')).toThrow(QueryParseError);
  });
});

function matcherFor(query: string): SearchMatcher {
  const node = parseQuery(query);
  if (!node) throw new Error('query must not be empty in tests');
  return new SearchMatcher(node);
}

describe('SearchMatcher.matches', () => {
  it('matches case-insensitively as substring', () => {
    expect(matcherFor('Foo').matches('say FOOBAR loudly')).toBe(true);
    expect(matcherFor('foo').matches('nothing here')).toBe(false);
  });

  it('AND requires both branches', () => {
    const m = matcherFor('foo bar');
    expect(m.matches('foo and bar here')).toBe(true);
    expect(m.matches('only foo here')).toBe(false);
  });

  it('OR requires either branch', () => {
    const m = matcherFor('foo OR bar');
    expect(m.matches('only bar here')).toBe(true);
    expect(m.matches('neither here')).toBe(false);
  });

  it('phrases match as whole substring including spaces', () => {
    expect(matcherFor('"hello world"').matches('say Hello World!')).toBe(true);
    expect(matcherFor('"hello world"').matches('hello there, world')).toBe(false);
  });

  it('grouping changes evaluation', () => {
    const m = matcherFor('(a OR b) zz');
    expect(m.matches('xx b zz')).toBe(true);
    expect(m.matches('xx a yy')).toBe(false); // zz missing
  });
});

describe('SearchMatcher.matchRanges', () => {
  it('returns a single range for one occurrence', () => {
    expect(matcherFor('bar').matchRanges('foo BAR baz')).toEqual([[4, 7]]);
  });

  it('returns ranges for all occurrences of a term', () => {
    expect(matcherFor('ab').matchRanges('ab ab')).toEqual([[0, 2], [3, 5]]);
  });

  it('merges overlapping occurrences', () => {
    // 'aba' occurs at 0 and 2 in 'ababa' → [0,3] and [2,5] merge to [0,5]
    expect(matcherFor('aba').matchRanges('ababa')).toEqual([[0, 5]]);
  });

  it('merges adjacent ranges from different terms', () => {
    // 'foo' → [0,3], 'bar' → [3,6] → adjacent → [0,6]
    expect(matcherFor('foo bar').matchRanges('foobar')).toEqual([[0, 6]]);
  });

  it('keeps disjoint ranges separate and sorted', () => {
    expect(matcherFor('foo bar').matchRanges('bar x foo')).toEqual([[0, 3], [6, 9]]);
  });
});
