/**
 * Typed client for the NestJS API.
 *
 * The response types mirror backend/src/reports/reports.dto.ts. Server
 * Components use the `get*` functions; the Client Components use
 * `uploadReport` (upload form) and `updateReport` (report editor). All of
 * them call NEXT_PUBLIC_API_URL.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 20);

export type IdentifierSource = 'pdf' | 'generated' | 'manual';
export type ExtractionMethod = 'text' | 'ocr' | 'mixed';
export type ReportStatus = 'completed' | 'no_parameters_found';

export interface ReportSummary {
  id: string;
  reportIdentifier: string;
  identifierSource: IdentifierSource;
  originalFilename: string;
  pageCount: number;
  extractionMethod: ExtractionMethod;
  status: ReportStatus;
  parameterCount: number;
  createdAt: string;
}

/** A row's four cells as text: name, result, unit and reference range. */
export interface ParameterCells {
  name: string;
  value: string | null;
  unit: string | null;
  range: string | null;
}

export interface Parameter {
  /** Stable key of the row within its report. */
  position: number;
  /** null for rows added by a user. */
  pageNumber: number | null;
  source: 'extracted' | 'manual';
  /** Set once a user changed the row; `original` is null for added rows. */
  edited: { at: string; original: ParameterCells | null } | null;
  name: string;
  parameterDefinitionId: number;
  value: { raw: string | null; numeric: number | null; comparator: '<' | '<=' | '>' | '>=' | null };
  unit: string | null;
  referenceRange: { raw: string | null; low: number | null; high: number | null };
  isAbnormal: boolean | null;
}

export interface ReportDetail extends ReportSummary {
  warnings: string[];
  parameters: Parameter[];
}

export interface UploadResult {
  duplicate: boolean;
  report: ReportDetail;
}

/** An API error with the server's message, safe to show to the user. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Fetches JSON and turns error responses and network failures into ApiError. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(`Cannot reach the API at ${API_URL}. Is the backend running?`, 0);
  }

  if (!response.ok) {
    // Nest error bodies look like { statusCode, message, error }.
    const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(message ?? `Request failed with status ${response.status}.`, response.status);
  }
  return (await response.json()) as T;
}

export function getReports(): Promise<ReportSummary[]> {
  return request('/reports');
}

/** Returns null when the report does not exist (or the id is malformed). */
export async function getReport(id: string): Promise<ReportDetail | null> {
  try {
    return await request<ReportDetail>(`/reports/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export function uploadReport(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  return request('/reports', { method: 'POST', body: form });
}

/** Changes to one existing row. Omitted cell = unchanged, null = cleared. */
export interface ParameterUpdate {
  position: number;
  name?: string;
  value?: string | null;
  unit?: string | null;
  range?: string | null;
}

/** Body of PATCH /reports/:id. */
export interface ReportChanges {
  reportIdentifier?: string;
  updateParameters?: ParameterUpdate[];
  addParameters?: ParameterCells[];
  removePositions?: number[];
}

/** Saves a user's corrections; returns the updated report. */
export function updateReport(id: string, changes: ReportChanges): Promise<ReportDetail> {
  return request(`/reports/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

/** URL of the original PDF, opened directly by the browser. */
export function originalFileUrl(id: string): string {
  return `${API_URL}/reports/${encodeURIComponent(id)}/file`;
}
