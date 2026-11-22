/**
 * Edit-mode data for the report page, and the conversion from "what the user
 * sees in the edited table" to the minimal set of changes the API needs.
 * Plain functions with no React or network code, so the logic is easy to
 * follow and test.
 */
import type { ParameterCells, ParameterUpdate, ReportChanges, ReportDetail } from './api';

/** One row in the edit table. Cells are plain strings ("" = empty). */
export interface DraftRow {
  /** React key; stable for the lifetime of the edit session. */
  key: string;
  /** Position of an existing row; undefined for a row added in this session. */
  position?: number;
  name: string;
  value: string;
  unit: string;
  range: string;
  /** Existing rows marked for removal (can be undone until saved). */
  removed: boolean;
}

export interface Draft {
  reportIdentifier: string;
  rows: DraftRow[];
}

/** Starts an edit session from the stored report. */
export function toDraft(report: ReportDetail): Draft {
  return {
    reportIdentifier: report.reportIdentifier,
    rows: report.parameters.map((p) => ({
      key: `row-${p.position}`,
      position: p.position,
      name: p.name,
      value: p.value.raw ?? '',
      unit: p.unit ?? '',
      range: p.referenceRange.raw ?? '',
      removed: false,
    })),
  };
}

/** A blank row for the user to fill in; its random key keeps React rows stable. */
export function emptyRow(): DraftRow {
  return { key: `new-${crypto.randomUUID()}`, name: '', value: '', unit: '', range: '', removed: false };
}

/** "" → null, so an emptied cell is sent as "clear this cell". */
function toCell(text: string): string | null {
  return text.trim() || null;
}

/** The cells besides the name, which may be left empty. */
const OPTIONAL_CELLS = ['value', 'unit', 'range'] as const;

/** Result of comparing the draft with the stored report. */
export type DraftCheck =
  | { ok: true; changes: ReportChanges | null } // null = nothing changed
  | { ok: false; error: string };

/**
 * Compares the draft with the stored report and returns only what changed,
 * or a message explaining why the draft can't be saved yet.
 */
export function buildChanges(report: ReportDetail, draft: Draft): DraftCheck {
  const identifier = draft.reportIdentifier.trim();
  if (!identifier) return { ok: false, error: 'The report ID cannot be empty.' };

  const stored = new Map(report.parameters.map((p) => [p.position, p]));
  const updates: ParameterUpdate[] = [];
  const additions: ParameterCells[] = [];
  const removals: number[] = [];

  for (const row of draft.rows) {
    const isBlank = !row.name.trim() && OPTIONAL_CELLS.every((field) => !row[field].trim());

    if (row.position === undefined) {
      // New row: skip if left completely empty, otherwise it needs a name.
      if (row.removed || isBlank) continue;
      if (!row.name.trim()) return { ok: false, error: 'Every added row needs a parameter name.' };
      additions.push({
        name: row.name.trim(),
        value: toCell(row.value),
        unit: toCell(row.unit),
        range: toCell(row.range),
      });
      continue;
    }

    if (row.removed) {
      removals.push(row.position);
      continue;
    }
    if (!row.name.trim()) return { ok: false, error: 'A parameter name cannot be empty.' };

    // Existing row: send only the cells that differ from what is stored.
    const current = stored.get(row.position)!;
    const before: ParameterCells = {
      name: current.name,
      value: current.value.raw,
      unit: current.unit,
      range: current.referenceRange.raw,
    };
    const update: ParameterUpdate = { position: row.position };
    if (row.name.trim() !== before.name) update.name = row.name.trim();
    for (const field of OPTIONAL_CELLS) {
      if (toCell(row[field]) !== before[field]) update[field] = toCell(row[field]);
    }
    if (Object.keys(update).length > 1) updates.push(update);
  }

  const changes: ReportChanges = {};
  if (identifier !== report.reportIdentifier) changes.reportIdentifier = identifier;
  if (updates.length) changes.updateParameters = updates;
  if (additions.length) changes.addParameters = additions;
  if (removals.length) changes.removePositions = removals;

  return { ok: true, changes: Object.keys(changes).length ? changes : null };
}
