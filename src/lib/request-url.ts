function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

export function requestPublicOrigin(request: Request): string {
  const internal = new URL(request.url);
  const host = firstHeaderValue(request.headers.get("x-forwarded-host"))
    ?? firstHeaderValue(request.headers.get("host"))
    ?? internal.host;
  const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : internal.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

export function requestPublicUrl(request: Request, path: string): URL {
  return new URL(path, requestPublicOrigin(request));
}
