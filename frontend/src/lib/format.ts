import type { ExtractionMethod, Parameter } from './api';

const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export const METHOD_LABELS: Record<ExtractionMethod, string> = {
  text: 'Text',
  ocr: 'OCR (scanned)',
  mixed: 'Text + OCR',
};

/**
 * "High" / "Low" for an out-of-range value, based on which bound it crosses;
 * null when the value is in range or cannot be judged.
 */
export function abnormalDirection(parameter: Parameter): 'High' | 'Low' | null {
  if (parameter.isAbnormal !== true || parameter.value.numeric === null) return null;
  const { low } = parameter.referenceRange;
  return low !== null && parameter.value.numeric < low ? 'Low' : 'High';
}
