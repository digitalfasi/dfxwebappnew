/**
 * Shared browser-download helper for every export button in the app.
 *
 * The backend returns export files as base64 inside the standard response
 * envelope (see Backend/app/schemas/export.py) rather than as a raw binary
 * response, so every export call reuses apiClient's existing auth/refresh
 * handling unchanged. This is the one place that base64 becomes an actual
 * file download — no page should decode/save an export file itself.
 */

export type ExportFormat = 'csv' | 'excel' | 'markdown';

export interface ExportFile {
  filename: string;
  contentType: string;
  format: ExportFormat;
  contentBase64: string;
  rowCount: number;
}

/** Shape of every `data.export` object returned by a `GET .../export/...` endpoint. */
export interface BackendExportFile {
  filename: string;
  content_type: string;
  format: ExportFormat;
  content_base64: string;
  row_count: number;
}

/** Single shared mapper — every export-fetching service method uses this,
 * instead of each re-declaring its own snake_case-to-camelCase mapping. */
export function mapExportFile(raw: BackendExportFile): ExportFile {
  return {
    filename: raw.filename,
    contentType: raw.content_type,
    format: raw.format,
    contentBase64: raw.content_base64,
    rowCount: raw.row_count,
  };
}

export function triggerExportDownload(file: ExportFile): void {
  const byteChars = atob(file.contentBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: file.contentType });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
