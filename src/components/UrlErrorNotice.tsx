import { Notice } from "@/components/Notice";
import { type ErrorViewer, viewerErrorMessage } from "@/lib/form-errors";

/**
 * The ?error= banner of a signed-in page: the message when one of our redirects signed it for this viewer,
 * otherwise the page's fixed sentence (see `viewerErrorMessage`). Server-only, like the signing secret.
 */
export function UrlErrorNotice({ params, viewer, fallback }: { params: { error?: string | string[]; sig?: string | string[]; at?: string | string[] }; viewer: ErrorViewer; fallback?: string }) {
  const message = viewerErrorMessage(params, viewer, fallback);
  return message ? <Notice type="error">{message}</Notice> : null;
}
