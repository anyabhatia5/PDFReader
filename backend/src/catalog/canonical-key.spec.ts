import { toCanonicalKey } from './canonical-key.js';

describe('toCanonicalKey', () => {
  it.each([
    ['Hemoglobin', 'hemoglobin'],
    ['HEMOGLOBIN', 'hemoglobin'],
    ['  Total   Cholesterol ', 'total cholesterol'],
    ['Haemoglobin (Hb)', 'haemoglobin hb'],
    ['Glucose (Fasting)', 'glucose fasting'],
    ['T.S.H.', 't s h'],
    ['HbA1c', 'hba1c'],
    ['Protéine', 'proteine'],
  ])('%s → %s', (name, key) => {
    expect(toCanonicalKey(name)).toBe(key);
  });

  it('keeps names that differ only in brackets distinct', () => {
    expect(toCanonicalKey('Glucose (Fasting)')).not.toBe(toCanonicalKey('Glucose (PP)'));
  });
});
