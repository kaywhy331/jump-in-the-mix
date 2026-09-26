/** The body is longer than the caller's limit, whether or not the client declared Content-Length. */
export class RequestTooLargeError extends Error {
  constructor() { super("Request is too large."); this.name = "RequestTooLargeError"; }
}

export async function boundedRequestText(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) throw new RequestTooLargeError();
  const reader = request.body?.getReader(); if (!reader) throw new Error("Request body is required.");
  let bytes = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const result = await reader.read(); if (result.done) break; bytes += result.value.byteLength; if (bytes > limit) { await reader.cancel(); throw new RequestTooLargeError(); } chunks.push(result.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
