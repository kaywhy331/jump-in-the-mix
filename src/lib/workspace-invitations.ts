import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

export const WORKSPACE_INVITE_COOKIE = "jitm_workspace_invite";
export const WORKSPACE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeInvitationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validInvitationEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function createWorkspaceInvitationToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashWorkspaceInvitationToken(raw) };
}

export function hashWorkspaceInvitationToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function workspaceInvitationStartUrl(raw: string): string {
  const url = new URL("/api/workspace-invitations/start", env.appUrl);
  url.searchParams.set("token", raw);
  return url.toString();
}
