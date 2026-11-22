import { ApiError } from '@/lib/api';

/**
 * Inline message for a failed API call. Our ApiError messages are written
 * for users ("Cannot reach the API… Is the backend running?"); anything else
 * is re-thrown to the page's error boundary.
 */
export function ErrorNotice({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) throw error;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {error.message}
    </p>
  );
}
