import type { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import {
  consumeGoogleOAuthState,
  decryptedGoogleCredentials,
  encryptedGoogleCredentials,
  readGoogleConnectionMetadata
} from "@/lib/google-contacts";
import { exchangeGoogleAuthorizationCodeForVerifiedAccount } from "@/lib/google-oauth-exchange";
import { prisma } from "@/lib/prisma";

function resultUrl(request: Request, returnTo: string, key: string, value: string): URL {
  const url = new URL(returnTo, request.url);
  url.searchParams.set(key, value);
  return url;
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.redirect(new URL("/login", request.url));
  if (session.impersonation) return NextResponse.redirect(new URL("/account?section=connections&google=readonly", request.url));

  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state") ?? "";
  if (!state) return NextResponse.redirect(new URL("/account?section=connections&googleError=Missing+OAuth+state", request.url));

  let returnTo = "/account?section=connections";
  let codeVerifier: string | null = null;
  try {
    ({ returnTo, codeVerifier } = await consumeGoogleOAuthState(membership.workspaceId, state));
    const oauthError = requestUrl.searchParams.get("error");
    if (oauthError) {
      const description = requestUrl.searchParams.get("error_description") || "Google access was not approved.";
      return NextResponse.redirect(resultUrl(request, returnTo, "googleError", description));
    }
    const code = requestUrl.searchParams.get("code");
    if (!code) throw new Error("Google did not return an authorization code.");

    const existing = await prisma.integrationConnection.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId: membership.workspaceId,
          provider: "GOOGLE_CONTACTS"
        }
      }
    });
    let existingRefreshToken: string | null = null;
    if (existing?.credentialsCiphertext) {
      try {
        existingRefreshToken = decryptedGoogleCredentials(existing).refreshToken;
      } catch {
        existingRefreshToken = null;
      }
    }

    const exchange = await exchangeGoogleAuthorizationCodeForVerifiedAccount({
      code,
      codeVerifier,
      existingExternalAccountId: existing?.externalAccountId,
      existingRefreshToken
    });
    const { credentials, account, accountChanged } = exchange;
    const externalAccountId = account.sub || account.email || null;
    const previousMetadata = accountChanged ? {} : readGoogleConnectionMetadata(existing?.metadata);
    const metadata = {
      ...previousMetadata,
      ...(account.email ? { accountEmail: account.email } : {}),
      ...(account.name ? { accountName: account.name } : {}),
      connectedAt: new Date().toISOString(),
      selectedGroupResourceNames: accountChanged ? [] : previousMetadata.selectedGroupResourceNames ?? [],
      selectedGroupLabels: accountChanged ? {} : previousMetadata.selectedGroupLabels ?? {},
      autoMergeExact: accountChanged ? true : previousMetadata.autoMergeExact !== false
    } as Prisma.InputJsonValue;

    await prisma.$transaction(async (tx) => {
      if (accountChanged && existing) {
        await tx.externalContactLink.updateMany({
          where: { workspaceId: membership.workspaceId, provider: "GOOGLE_CONTACTS", deletedAt: null },
          data: { deletedAt: new Date() }
        });
        await tx.syncRun.updateMany({
          where: { connectionId: existing.id, status: { in: ["QUEUED", "RUNNING"] } },
          data: { status: "CANCELED", completedAt: new Date(), errorSummary: "A different Google account was connected." }
        });
        await tx.job.updateMany({
          where: {
            workspaceId: membership.workspaceId,
            task: "sync-google-contacts",
            completedAt: null,
            failedAt: null
          },
          data: { failedAt: new Date(), lastError: "A different Google account was connected.", lockedAt: null, lockedBy: null }
        });
      }
      const saved = await tx.integrationConnection.upsert({
        where: {
          workspaceId_provider: {
            workspaceId: membership.workspaceId,
            provider: "GOOGLE_CONTACTS"
          }
        },
        create: {
          workspaceId: membership.workspaceId,
          provider: "GOOGLE_CONTACTS",
          status: "ACTIVE",
          externalAccountId,
          scopes: credentials.scope.split(/\s+/).filter(Boolean),
          credentialsCiphertext: encryptedGoogleCredentials(credentials),
          metadata
        },
        update: {
          status: "ACTIVE",
          externalAccountId,
          scopes: credentials.scope.split(/\s+/).filter(Boolean),
          credentialsCiphertext: encryptedGoogleCredentials(credentials),
          ...(accountChanged ? { syncCursor: null, lastSyncAt: null, nextSyncAt: null } : {}),
          metadata,
          lastError: null
        }
      });
      await tx.auditLog.create({
        data: {
          workspaceId: membership.workspaceId,
          actorType: "USER",
          actorUserId: session.authUser.id,
          action: existing ? "integration.google.reconnect" : "integration.google.connect",
          entityType: "IntegrationConnection",
          entityId: saved.id,
          source: "google.oauth",
          metadata: { accountEmail: account.email ?? null, accountChanged }
        }
      });
    });

    return NextResponse.redirect(resultUrl(request, returnTo, "google", "connected"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Contacts could not be connected.";
    return NextResponse.redirect(resultUrl(request, returnTo, "googleError", message));
  }
}
