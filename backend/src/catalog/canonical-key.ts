/**
 * Builds the key used to match a printed parameter name to the catalog.
 *
 * Lowercases, strips accents, and turns every run of non-alphanumeric
 * characters into one space. Bracketed text is kept because it can change
 * the meaning ("Glucose (Fasting)" vs "Glucose (PP)").
 *
 * @example toCanonicalKey('Haemoglobin (Hb)')   // 'haemoglobin hb'
 * @example toCanonicalKey('  T.S.H.  ')         // 't s h'
 * @example toCanonicalKey('Total  Cholesterol') // 'total cholesterol'
 */
export function toCanonicalKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // remove accents: "é" → "e"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
