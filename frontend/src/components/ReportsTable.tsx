import Link from 'next/link';
import { getReports, type ReportSummary } from '@/lib/api';
import { formatDate, METHOD_LABELS } from '@/lib/format';
import { Badge } from './Badge';
import { ErrorNotice } from './ErrorNotice';

/**
 * Server Component: fetches the list of reports on every request (data is
 * uncached by default with Cache Components), so new uploads appear at once.
 */
export async function ReportsTable() {
  let reports: ReportSummary[];
  try {
    reports = await getReports();
  } catch (error) {
    return <ErrorNotice error={error} />;
  }

  if (reports.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No reports yet. Upload a PDF to get started.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
          <tr>
            <th className="px-4 py-3">Report / Sample ID</th>
            <th className="px-4 py-3">File</th>
            <th className="px-4 py-3 text-right">Parameters</th>
            <th className="px-4 py-3">Read with</th>
            <th className="px-4 py-3">Uploaded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {reports.map((report) => (
            <tr key={report.id} className="hover:bg-zinc-50">
              <td className="whitespace-nowrap px-4 py-3">
                <Link href={`/reports/${report.id}`} className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                  {report.reportIdentifier}
                </Link>
                {report.identifierSource === 'generated' && (
                  <span className="ml-2">
                    <Badge tone="warning">Generated ID</Badge>
                  </span>
                )}
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-zinc-600" title={report.originalFilename}>
                {report.originalFilename}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {report.status === 'no_parameters_found' ? <Badge tone="danger">None found</Badge> : report.parameterCount}
              </td>
              <td className="px-4 py-3">
                <Badge tone={report.extractionMethod === 'text' ? 'neutral' : 'info'}>
                  {METHOD_LABELS[report.extractionMethod]}
                </Badge>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{formatDate(report.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
