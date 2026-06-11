import { describe, it, expect } from 'vitest';
import { parseQuery, QueryParseError, SearchNode } from './search';

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
