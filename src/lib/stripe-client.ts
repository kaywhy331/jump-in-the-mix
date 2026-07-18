import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

type StripeParam = string | number | boolean | null | undefined;
type StripeParams = Record<string, StripeParam>;

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigurationError";
  }
}

export class StripeApiError extends Error {
  status: number;
  code: string | null;
  type: string | null;

  constructor(message: string, status: number, code: string | null = null, type: string | null = null) {
    super(message);
    this.name = "StripeApiError";
    this.status = status;
    this.code = code;
    this.type = type;
  }
}

export class StripeWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeWebhookSignatureError";
  }
}

function requireStripeSecretKey(): string {
  if (!env.stripeSecretKey) {
    throw new StripeConfigurationError("Stripe Checkout is not configured. Add STRIPE_SECRET_KEY on the server.");
  }
  return env.stripeSecretKey;
}

function encodeStripeParams(params: StripeParams): URLSearchParams {
  const encoded = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === null || rawValue === undefined) continue;
    encoded.set(key, typeof rawValue === "boolean" ? String(rawValue) : String(rawValue));
  }
  return encoded;
}

export async function stripeRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    params?: StripeParams;
    idempotencyKey?: string;
  } = {}
): Promise<T> {
  const secretKey = requireStripeSecretKey();
  const method = options.method ?? "POST";
  const params = encodeStripeParams(options.params ?? {});
  const url = new URL(`https://api.stripe.com${path.startsWith("/") ? path : `/${path}`}`);
  if (method === "GET") {
    for (const [key, value] of params.entries()) url.searchParams.append(key, value);
  }

  const headers = new Headers({
    Authorization: `Bearer ${secretKey}`,
    "Stripe-Version": env.stripeApiVersion
  });
  if (method === "POST") headers.set("Content-Type", "application/x-www-form-urlencoded");
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey.slice(0, 255));

  const response = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? params.toString() : undefined,
    cache: "no-store"
  });

  const payload = await response.json().catch(() => null) as {
    error?: { message?: string; code?: string; type?: string };
  } | T | null;
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : undefined;
    throw new StripeApiError(
      error?.message || `Stripe returned HTTP ${response.status}.`,
      response.status,
      error?.code ?? null,
      error?.type ?? null
    );
  }
  return payload as T;
}

function signatureParts(header: string): { timestamp: number; signatures: string[] } {
  const values = header.split(",").map((part) => part.trim()).filter(Boolean);
  let timestamp = 0;
  const signatures: string[] = [];
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator <= 0) continue;
    const key = value.slice(0, separator);
    const content = value.slice(separator + 1);
    if (key === "t") timestamp = Number(content);
    if (key === "v1" && /^[a-f0-9]{64}$/i.test(content)) signatures.push(content.toLowerCase());
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !signatures.length) {
    throw new StripeWebhookSignatureError("The Stripe-Signature header is malformed.");
  }
  return { timestamp, signatures };
}

function secureHexEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret = env.stripeWebhookSecret,
  toleranceSeconds = env.stripeWebhookToleranceSeconds,
  nowSeconds = Math.floor(Date.now() / 1000)
): void {
  if (!secret) throw new StripeConfigurationError("STRIPE_WEBHOOK_SECRET is not configured.");
  if (!signatureHeader) throw new StripeWebhookSignatureError("The Stripe-Signature header is missing.");
  const { timestamp, signatures } = signatureParts(signatureHeader);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new StripeWebhookSignatureError("The Stripe webhook timestamp is outside the allowed tolerance.");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  if (!signatures.some((signature) => secureHexEqual(expected, signature))) {
    throw new StripeWebhookSignatureError("The Stripe webhook signature could not be verified.");
  }
}

export function stripePayloadHash(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

export function stripeUnixDate(value: unknown): Date | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? new Date(number * 1000) : null;
}
