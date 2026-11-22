import { isOutOfRange, parseReferenceRange, parseValue } from './value-parser.js';

describe('parseValue', () => {
  it.each([
    ['13.2', 13.2, null],
    ['<5', 5, '<'],
    ['< 0.5', 0.5, '<'],
    ['>=40', 40, '>='],
    ['≤ 7', 7, '<='],
    ['1,50,000', 150000, null],
    ['-2.5', -2.5, null],
  ])('reads %s as a number', (raw, numeric, comparator) => {
    expect(parseValue(raw)).toEqual({ raw, numeric, comparator });
  });

  it('ignores a high/low flag when reading the number, but keeps the raw text', () => {
    expect(parseValue('18.4 H')).toEqual({ raw: '18.4 H', numeric: 18.4, comparator: null });
    expect(parseValue('3.1 (L)')).toEqual({ raw: '3.1 (L)', numeric: 3.1, comparator: null });
    expect(parseValue('250*')).toEqual({ raw: '250*', numeric: 250, comparator: null });
  });

  it.each(['Positive', 'Nil', 'Negative', 'Reactive', 'Pale Yellow', 'High'])(
    'keeps text result %s as text with no number',
    (raw) => {
      expect(parseValue(raw)).toEqual({ raw, numeric: null, comparator: null });
    },
  );

  it.each([null, undefined, '', '  ', '-', '—'])('treats %s as a missing value', (raw) => {
    expect(parseValue(raw)).toEqual({ raw: null, numeric: null, comparator: null });
  });
});

describe('parseReferenceRange', () => {
  it.each([
    ['13.0 - 17.0', 13, 17],
    ['13-17', 13, 17],
    ['4.5 – 11', 4.5, 11],
    ['70 to 100', 70, 100],
    ['1,50,000 - 4,10,000', 150000, 410000],
    ['13 - 17 g/dL', 13, 17],
    ['4,000 11,000', 4000, 11000], // OCR dropped the dash
    ['< 200', null, 200],
    ['<=5', null, 5],
    ['Up to 40', null, 40],
    ['> 40', 40, null],
    ['>= 60', 60, null],
  ])('reads %s as low=%s high=%s', (raw, low, high) => {
    expect(parseReferenceRange(raw)).toEqual({ raw, low, high });
  });

  it('keeps a text range without numeric bounds', () => {
    expect(parseReferenceRange('Negative')).toEqual({ raw: 'Negative', low: null, high: null });
  });

  it('treats an empty cell as no range', () => {
    expect(parseReferenceRange('')).toEqual({ raw: null, low: null, high: null });
  });
});

describe('isOutOfRange', () => {
  const range = parseReferenceRange('13 - 17');

  it('flags values below or above the range', () => {
    expect(isOutOfRange(parseValue('12.9'), range)).toBe(true);
    expect(isOutOfRange(parseValue('17.1'), range)).toBe(true);
  });

  it('accepts values inside the range, bounds included', () => {
    expect(isOutOfRange(parseValue('13'), range)).toBe(false);
    expect(isOutOfRange(parseValue('17'), range)).toBe(false);
  });

  it('works with one-sided ranges', () => {
    expect(isOutOfRange(parseValue('220'), parseReferenceRange('< 200'))).toBe(true);
    expect(isOutOfRange(parseValue('35'), parseReferenceRange('> 40'))).toBe(true);
  });

  it('returns null when it cannot decide', () => {
    expect(isOutOfRange(parseValue('Positive'), parseReferenceRange('Negative'))).toBeNull();
    expect(isOutOfRange(parseValue('<5'), range)).toBeNull();
    expect(isOutOfRange(parseValue('14'), parseReferenceRange(null))).toBeNull();
  });
});
