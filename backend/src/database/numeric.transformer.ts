import type { ValueTransformer } from 'typeorm';

/**
 * Postgres returns NUMERIC columns as strings (to avoid losing precision).
 * Lab values easily fit in a JavaScript number, so convert them on read.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
