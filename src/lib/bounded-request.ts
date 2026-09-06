export async function boundedRequestText(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) throw new Error("Request is too large.");
  const reader = request.body?.getReader(); if (!reader) throw new Error("Request body is required.");
  let bytes = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const result = await reader.read(); if (result.done) break; bytes += result.value.byteLength; if (bytes > limit) { await reader.cancel(); throw new Error("Request is too large."); } chunks.push(result.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
