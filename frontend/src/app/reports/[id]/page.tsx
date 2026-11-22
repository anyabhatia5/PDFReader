import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Badge } from '@/components/Badge';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ReportEditor } from '@/components/ReportEditor';
import { getReport, originalFileUrl, type ReportDetail as ReportDetailData } from '@/lib/api';
import { formatDate, METHOD_LABELS } from '@/lib/format';

/**
 * Report detail page. The route param is request-time data, so it is read
 * inside a Suspense boundary (required with Cache Components).
 */
export default function ReportPage({ params }: PageProps<'/reports/[id]'>) {
  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-900">
        ← All reports
      </Link>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading report…</p>}>
        <ReportDetail params={params} />
      </Suspense>
    </div>
  );
}

async function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let report: ReportDetailData | null;
  try {
    report = await getReport(id);
  } catch (error) {
    return <ErrorNotice error={error} />;
  }
  if (!report) notFound();

  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{report.reportIdentifier}</h1>
          {report.identifierSource === 'generated' && <Badge tone="warning">Generated ID</Badge>}
          {report.identifierSource === 'manual' && <Badge tone="info">ID entered manually</Badge>}
          <Badge tone={report.extractionMethod === 'text' ? 'neutral' : 'info'}>
            {METHOD_LABELS[report.extractionMethod]}
          </Badge>
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600">
          <div>
            <dt className="inline">File: </dt>
            <dd className="inline text-zinc-900">{report.originalFilename}</dd>
          </div>
          <div>
            <dt className="inline">Pages: </dt>
            <dd className="inline text-zinc-900">{report.pageCount}</dd>
          </div>
          <div>
            <dt className="inline">Parameters: </dt>
            <dd className="inline text-zinc-900">{report.parameterCount}</dd>
          </div>
          <div>
            <dt className="inline">Uploaded: </dt>
            <dd className="inline text-zinc-900">{formatDate(report.createdAt)}</dd>
          </div>
        </dl>

        <a
          href={originalFileUrl(report.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium underline underline-offset-2"
        >
          View original PDF ↗
        </a>
      </header>

      {report.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {/* Notes describe the automatic extraction, so they stay as-is after manual edits. */}
          <p className="mb-1 font-medium">Extraction notes</p>
          <ul className="space-y-1">
            {report.warnings.map((warning) => (
              <li key={warning}>⚠ {warning}</li>
            ))}
          </ul>
        </div>
      )}

      <ReportEditor report={report} />
    </article>
  );
}
