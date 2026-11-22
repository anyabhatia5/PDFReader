import { Suspense } from 'react';
import { ReportsTable } from '@/components/ReportsTable';
import { UploadForm } from '@/components/UploadForm';

/** Home: upload a PDF, and see every stored report. */
export default function HomePage() {
  return (
    <div className="space-y-8">
      <UploadForm />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Reports</h2>
        {/* The list is fetched per request; the rest of the page renders immediately. */}
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading reports…</p>}>
          <ReportsTable />
        </Suspense>
      </section>
    </div>
  );
}
