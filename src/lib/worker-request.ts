import { timingSafeEqual } from "node:crypto";

export function workerRequestAuthorized(request: Request, secret: string | undefined): boolean {
  if (request.method !== "POST" || !secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
