'use client';

import { useEffect } from 'react';

/**
 * Last-resort error boundary for unexpected failures. (Expected ones, like
 * the API being unreachable, are handled where the data is loaded.) In
 * production Next.js hides server error details, so a generic message is
 * shown; `retry` re-fetches and re-renders the page.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
      <h1 className="text-base font-semibold">Something went wrong</h1>
      <p>The page could not be loaded. Please try again.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-600"
      >
        Try again
      </button>
    </div>
  );
}
