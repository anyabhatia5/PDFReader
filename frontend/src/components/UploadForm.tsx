'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, MAX_UPLOAD_MB, uploadReport, type UploadResult } from '@/lib/api';

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string }
  | { kind: 'done'; result: UploadResult }
  | { kind: 'error'; message: string };

/**
 * Checks a chosen file before uploading, so obvious mistakes get instant
 * feedback. The server repeats every check: this is a convenience only.
 */
function validate(file: File | undefined): string | null {
  if (!file) return 'Choose a PDF file first.';
  const looksLikePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) return 'Only PDF files are accepted.';
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `The file is larger than ${MAX_UPLOAD_MB} MB.`;
  return null;
}

/** Upload box: sends the PDF to the API and reports what happened. */
export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    const problem = validate(file);
    if (problem || !file) {
      setStatus({ kind: 'error', message: problem ?? 'Choose a PDF file first.' });
      return;
    }

    setStatus({ kind: 'uploading', fileName: file.name });
    try {
      const result = await uploadReport(file);
      setStatus({ kind: 'done', result });
      if (inputRef.current) inputRef.current.value = '';
      router.refresh(); // re-render the server-side reports list
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Upload failed. Please try again.';
      setStatus({ kind: 'error', message });
    }
  }

  const uploading = status.kind === 'uploading';

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">Upload a report</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Lab, test, process or calibration reports as PDF, up to {MAX_UPLOAD_MB} MB. Scanned reports are read
        with OCR, which takes a few seconds.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept="application/pdf,.pdf"
          disabled={uploading}
          onChange={() => setStatus({ kind: 'idle' })}
          className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200"
        />
        <button
          type="submit"
          disabled={uploading}
          className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-60"
        >
          {uploading ? 'Extracting…' : 'Upload & extract'}
        </button>
      </div>

      <div aria-live="polite" className="mt-3 text-sm">
        {status.kind === 'uploading' && <p className="text-zinc-600">Reading {status.fileName}…</p>}
        {status.kind === 'error' && <p className="text-red-700">{status.message}</p>}
        {status.kind === 'done' && <UploadMessage result={status.result} />}
      </div>
    </form>
  );
}

function UploadMessage({ result }: { result: UploadResult }) {
  const { report, duplicate } = result;
  const link = (
    <Link href={`/reports/${report.id}`} className="font-medium underline underline-offset-2">
      View report {report.reportIdentifier}
    </Link>
  );

  if (duplicate) {
    return (
      <p className="text-amber-800">
        This file was already uploaded, so nothing new was saved. {link}
      </p>
    );
  }
  return (
    <p className="text-emerald-700">
      Extracted {report.parameterCount} parameter{report.parameterCount === 1 ? '' : 's'} from{' '}
      {report.originalFilename}. {link}
    </p>
  );
}
