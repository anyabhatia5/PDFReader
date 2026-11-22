import Link from 'next/link';

/** Shown for unknown URLs and for report ids that don't exist. */
export default function NotFound() {
  return (
    <div className="space-y-3 py-12 text-center">
      <h1 className="text-xl font-semibold">Report not found</h1>
      <p className="text-sm text-zinc-600">It may have been removed, or the link is incorrect.</p>
      <Link href="/" className="inline-block text-sm font-medium underline underline-offset-2">
        Back to all reports
      </Link>
    </div>
  );
}
