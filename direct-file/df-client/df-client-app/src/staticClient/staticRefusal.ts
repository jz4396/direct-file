import { STATIC_UNAVAILABLE } from './localApi.js';
import { isStaticClientOnly } from './staticMode.js';

/**
 * System-alert keys for operations the static client cannot perform.
 * `processSystemAlert` prefixes these with `systemAlerts.`.
 * PDF uses `STATIC_PDF_REFUSAL_I18N` directly (DFAlert does not add that prefix).
 */
export const STATIC_PDF_REFUSAL_KEY = `staticClient.pdfRefusal`;
export const STATIC_EFILE_REFUSAL_KEY = `staticClient.efileRefusal`;
export const STATIC_PDF_REFUSAL_I18N = `systemAlerts.${STATIC_PDF_REFUSAL_KEY}`;

/** Set when a PDF download is attempted in the static client. Null on the server build. */
export function staticPdfRefusalKey(): string | null {
  return isStaticClientOnly() ? STATIC_PDF_REFUSAL_KEY : null;
}

/**
 * Set when sign or submit fails because the static API answered `not-available-in-static-client`.
 * Any other error keeps the caller's existing alert. Null on the server build, even for that message.
 */
export function staticEfileRefusalKey(error: unknown): string | null {
  if (!isStaticClientOnly()) return null;
  if (
    typeof error === `object` &&
    error !== null &&
    `message` in error &&
    (error as { message: unknown }).message === STATIC_UNAVAILABLE
  ) {
    return STATIC_EFILE_REFUSAL_KEY;
  }
  return null;
}
