import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { confirmEmailChangeAction } from "@/lib/account-email-actions";
import { hashAuthToken } from "@/lib/auth-tokens";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Confirm email change" };

type SearchParams = { token?: string; error?: string };

export default async function ConfirmEmailChangePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const token = query.token?.trim() ?? "";
  const record = token ? await prisma.verificationToken.findFirst({ where: { tokenHash: hashAuthToken(token), purpose: { startsWith: "email-change:" }, usedAt: null, expiresAt: { gt: new Date() } }, select: { email: true, expiresAt: true } }) : null;
  return (
    <main className="auth-shell"><section className="auth-card"><Logo /><h1>Confirm email change</h1>{query.error && <Notice type="error">{query.error}</Notice>}{record ? <><p>Confirm <strong>{record.email}</strong> as the new account email. All active sessions will be signed out after the change.</p><p className="muted-copy">Link expires {record.expiresAt.toLocaleString()}.</p><form action={confirmEmailChangeAction}><input type="hidden" name="token" value={token} /><button className="button primary full-width" type="submit">Confirm new email</button></form></> : <><Notice type="error">This email confirmation link is invalid, expired, or already used.</Notice><Link className="button" href="/login">Return to sign in</Link></>}</section></main>
  );
}
