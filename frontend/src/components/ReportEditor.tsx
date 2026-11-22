'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, updateReport, type ReportDetail } from '@/lib/api';
import { buildChanges, emptyRow, toDraft, type Draft, type DraftRow } from '@/lib/report-edits';
import { ParameterTable } from './ParameterTable';

/**
 * The report's parameter table with an edit mode for correcting extraction
 * mistakes (e.g. OCR misreads): edit cells, add missed rows, remove junk rows
 * and fix the report ID, then save everything in one request.
 */
export function ReportEditor({ report }: { report: ReportDetail }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null); // null = view mode
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(toDraft(report));
    setError(null);
  }

  function updateRow(key: string, changes: Partial<DraftRow>) {
    setDraft((current) =>
      current && { ...current, rows: current.rows.map((row) => (row.key === key ? { ...row, ...changes } : row)) },
    );
  }

  function deleteNewRow(key: string) {
    setDraft((current) => current && { ...current, rows: current.rows.filter((row) => row.key !== key) });
  }

  async function save() {
    if (!draft) return;
    const check = buildChanges(report, draft);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (!check.changes) {
      setDraft(null); // nothing changed
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateReport(report.id, check.changes);
      setDraft(null);
      router.refresh(); // re-render the page with the saved data
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Saving failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!draft) {
    return (
      <section className="space-y-3">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={startEditing}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
          >
            Edit values
          </button>
        </div>
        {report.parameters.length > 0 ? (
          <ParameterTable parameters={report.parameters} pageCount={report.pageCount} />
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
            No parameters were extracted. Open the original PDF, then use “Edit values” to add them by hand.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-sky-200 bg-sky-50/40 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Report / Sample ID</span>
          <input
            value={draft.reportIdentifier}
            onChange={(event) => setDraft({ ...draft, reportIdentifier: event.target.value })}
            className="w-64 rounded-md border border-zinc-300 bg-white px-2 py-1.5"
          />
        </label>
        <p className="max-w-md text-xs text-zinc-600">
          Correct any cell, add rows the extraction missed, or remove wrong ones. Values are re-checked against
          their ranges when you save, and the originally extracted text is kept.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
            <tr>
              <th className="px-3 py-2">Parameter</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Reference Range / Limits</th>
              <th className="px-3 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {draft.rows.map((row) => (
              <EditableRow
                key={row.key}
                row={row}
                onChange={(changes) => updateRow(row.key, changes)}
                onDelete={() => deleteNewRow(row.key)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setDraft({ ...draft, rows: [...draft.rows, emptyRow()] })}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
        >
          + Add row
        </button>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(null)}
            disabled={saving}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}

const CELL_FIELDS = [
  ['name', 'Parameter'],
  ['value', 'Result'],
  ['unit', 'Unit'],
  ['range', 'Reference range'],
] as const;

/** One row of the edit table: four inputs plus Remove / Undo. */
function EditableRow({
  row,
  onChange,
  onDelete,
}: {
  row: DraftRow;
  onChange: (changes: Partial<DraftRow>) => void;
  onDelete: () => void;
}) {
  const isNew = row.position === undefined;
  return (
    <tr className={row.removed ? 'bg-zinc-50 opacity-50' : undefined}>
      {CELL_FIELDS.map(([field, label]) => (
        <td key={field} className="px-3 py-1.5">
          <input
            aria-label={label}
            value={row[field]}
            disabled={row.removed}
            onChange={(event) => onChange({ [field]: event.target.value })}
            className={`w-full min-w-24 rounded border border-zinc-300 px-2 py-1 ${row.removed ? 'line-through' : ''}`}
          />
        </td>
      ))}
      <td className="whitespace-nowrap px-3 py-1.5 text-right">
        <button
          type="button"
          onClick={isNew ? onDelete : () => onChange({ removed: !row.removed })}
          className="text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
        >
          {row.removed ? 'Undo' : 'Remove'}
        </button>
      </td>
    </tr>
  );
}
