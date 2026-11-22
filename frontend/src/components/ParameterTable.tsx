import { Fragment } from 'react';
import type { Parameter } from '@/lib/api';
import { abnormalDirection } from '@/lib/format';

/** Shown for any column the PDF left empty. */
const EMPTY = <span className="text-zinc-400">—</span>;

/**
 * The extracted parameters in the same column layout as the report:
 * Parameter | Result | Unit | Reference Range / Limits. Out-of-range results are
 * highlighted; a divider marks where the PDF continued on a new page.
 */
export function ParameterTable({ parameters, pageCount }: { parameters: Parameter[]; pageCount: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
          <tr>
            <th className="w-12 px-4 py-3 text-right">#</th>
            <th className="px-4 py-3">Parameter</th>
            <th className="px-4 py-3">Result</th>
            <th className="px-4 py-3">Unit</th>
            <th className="px-4 py-3">Reference Range / Limits</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {parameters.map((parameter, index) => {
            const startsNewPage = pageCount > 1 && parameter.pageNumber !== parameters[index - 1]?.pageNumber;
            const direction = abnormalDirection(parameter);
            return (
              <Fragment key={parameter.position}>
                {startsNewPage && (
                  <tr className="bg-zinc-50/60">
                    <td colSpan={5} className="px-4 py-1.5 text-xs font-medium text-zinc-500">
                      Page {parameter.pageNumber}
                    </td>
                  </tr>
                )}
                <tr className={direction ? 'bg-red-50/50' : undefined}>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">{parameter.position}</td>
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{parameter.name}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {parameter.value.raw === null ? (
                      <span className="text-zinc-400 italic">not reported</span>
                    ) : (
                      <span className={direction ? 'font-semibold text-red-700' : undefined}>
                        {parameter.value.raw}
                        {direction && <span className="ml-2 text-xs font-medium">({direction})</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">{parameter.unit ?? EMPTY}</td>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-600">{parameter.referenceRange.raw ?? EMPTY}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
