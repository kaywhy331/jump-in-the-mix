import { createHash, randomBytes } from "node:crypto";
import type { IntegrationConnection, Prisma } from "@/generated/prisma/client";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/contact-input";
import { stableImportHash } from "@/lib/contact-import-shared";
import { env } from "@/lib/env";
import {
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
  integrationEncryptionConfigured
} from "@/lib/integration-crypto";
import { prisma } from "@/lib/prisma";

export const GOOGLE_CONTACTS_PROVIDER = "GOOGLE_CONTACTS" as const;
export const GOOGLE_CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
const GOOGLE_SCOPES = ["openid", "email", GOOGLE_CONTACTS_SCOPE];
const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_PEOPLE_ENDPOINT = "https://people.googleapis.com/v1";
const PERSON_FIELDS = [
  "addresses",
  "biographies",
  "birthdays",
  "emailAddresses",
  "events",
  "memberships",
  "metadata",
  "names",
  "organizations",
  "phoneNumbers",
  "photos"
].join(",");

export type GoogleCredentials = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
};

export type GoogleConnectionMetadata = {
  accountEmail?: string;
  accountName?: string;
  connectedAt?: string;
  selectedGroupResourceNames?: string[];
  selectedGroupLabels?: Record<string, string>;
  autoMergeExact?: boolean;
  lastSummary?: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
};

export type GoogleContactGroup = {
  resourceName: string;
  name: string;
  groupType: string | null;
  memberCount: number;
};

type GoogleDate = {
  year?: number;
  month?: number;
  day?: number;
};

type GoogleFieldMetadata = {
  primary?: boolean;
  sourcePrimary?: boolean;
};

export type GooglePerson = {
  resourceName?: string;
  etag?: string;
  metadata?: {
    deleted?: boolean;
    sources?: Array<{ type?: string; id?: string; etag?: string; updateTime?: string }>;
  };
  names?: Array<{
    displayName?: string;
    givenName?: string;
    familyName?: string;
    metadata?: GoogleFieldMetadata;
  }>;
  emailAddresses?: Array<{
    value?: string;
    type?: string;
    formattedType?: string;
    metadata?: GoogleFieldMetadata;
  }>;
  phoneNumbers?: Array<{
    value?: string;
    canonicalForm?: string;
    type?: string;
    formattedType?: string;
    metadata?: GoogleFieldMetadata;
  }>;
  addresses?: Array<{
    formattedValue?: string;
    streetAddress?: string;
    extendedAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    type?: string;
    formattedType?: string;
    metadata?: GoogleFieldMetadata;
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
    current?: boolean;
    metadata?: GoogleFieldMetadata;
  }>;
  biographies?: Array<{
    value?: string;
    contentType?: string;
    metadata?: GoogleFieldMetadata;
  }>;
  birthdays?: Array<{
    date?: GoogleDate;
    text?: string;
    metadata?: GoogleFieldMetadata;
  }>;
  events?: Array<{
    date?: GoogleDate;
    type?: string;
    formattedType?: string;
    metadata?: GoogleFieldMetadata;
  }>;
  memberships?: Array<{
    contactGroupMembership?: {
      contactGroupId?: string;
      contactGroupResourceName?: string;
    };
  }>;
  photos?: Array<{ url?: string; default?: boolean; metadata?: GoogleFieldMetadata }>;
};

export type GoogleContactRecord = {
  rowId: string;
  sourceRow: number;
  externalId: string;
  etag: string | null;
  deleted: boolean;
  updatedAt: string | null;
  membershipResourceNames: string[];
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  company: string | null;
  publicNotes: string | null;
  emails: Array<{ value: string; label: string | null; isPrimary: boolean }>;
  phones: Array<{ value: string; label: string | null; isPrimary: boolean }>;
  addresses: Array<{
    label: string | null;
    street1: string | null;
    street2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    isPrimary: boolean;
  }>;
  jumpDates: Array<{
    dateTypeName: "Birthday" | "Anniversary";
    label: string | null;
    dateValue: string | null;
    month: number;
    day: number;
    recurrence: "YEARLY";
  }>;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
};

export class GoogleApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.payload = payload;
  }
}

function normalizedReturnTo(value: string | null | undefined): string {
  const candidate = (value ?? "/account").trim();
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/account";
}

function hashToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function clean(value: string | null | undefined, maxLength = 2000): string | null {
  const next = (value ?? "").trim();
  return next ? next.slice(0, maxLength) : null;
}

function primaryFirst<T extends { metadata?: GoogleFieldMetadata }>(values: T[] | undefined): T[] {
  return [...(values ?? [])].sort((left, right) => Number(Boolean(right.metadata?.primary)) - Number(Boolean(left.metadata?.primary)));
}

function fieldLabel(value: { formattedType?: string; type?: string }): string | null {
  return clean(value.formattedType || value.type, 80);
}

function htmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .trim();
}

function validGoogleDate(value: GoogleDate | undefined): value is Required<Pick<GoogleDate, "month" | "day">> & GoogleDate {
  if (!value?.month || !value.day) return false;
  const year = value.year ?? 2000;
  const parsed = new Date(Date.UTC(year, value.month - 1, value.day));
  return parsed.getUTCMonth() + 1 === value.month && parsed.getUTCDate() === value.day;
}

function logicalDate(value: GoogleDate): string | null {
  if (!value.year || !validGoogleDate(value)) return null;
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function ensureOnePrimary<T extends { isPrimary: boolean }>(values: T[]): T[] {
  if (!values.length) return values;
  const firstPrimary = values.findIndex((item) => item.isPrimary);
  const selected = firstPrimary >= 0 ? firstPrimary : 0;
  return values.map((item, index) => ({ ...item, isPrimary: index === selected }));
}

function googleErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const object = payload as Record<string, unknown>;
  const error = object.error;
  if (typeof error === "string") return typeof object.error_description === "string" ? object.error_description : error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

export function googleIntegrationConfigured(): boolean {
  return Boolean(
    env.googleClientId.trim()
    && env.googleClientSecret.trim()
    && env.googleRedirectUri.trim()
    && integrationEncryptionConfigured()
  );
}

export function readGoogleConnectionMetadata(value: Prisma.JsonValue | null | undefined): GoogleConnectionMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const object = value as Record<string, unknown>;
  const groups = Array.isArray(object.selectedGroupResourceNames)
    ? object.selectedGroupResourceNames.filter((item): item is string => typeof item === "string")
    : [];
  const labels = object.selectedGroupLabels && typeof object.selectedGroupLabels === "object" && !Array.isArray(object.selectedGroupLabels)
    ? Object.fromEntries(Object.entries(object.selectedGroupLabels as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  const summary = object.lastSummary && typeof object.lastSummary === "object" && !Array.isArray(object.lastSummary)
    ? object.lastSummary as GoogleConnectionMetadata["lastSummary"]
    : undefined;
  return {
    accountEmail: typeof object.accountEmail === "string" ? object.accountEmail : undefined,
    accountName: typeof object.accountName === "string" ? object.accountName : undefined,
    connectedAt: typeof object.connectedAt === "string" ? object.connectedAt : undefined,
    selectedGroupResourceNames: groups,
    selectedGroupLabels: labels,
    autoMergeExact: typeof object.autoMergeExact === "boolean" ? object.autoMergeExact : true,
    lastSummary: summary
  };
}

export async function createGoogleAuthorizationUrl(input: {
  workspaceId: string;
  returnTo?: string | null;
  loginHint?: string | null;
}): Promise<string> {
  if (!googleIntegrationConfigured()) throw new Error("Google Contacts is not configured for this environment.");
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.$transaction([
    prisma.oAuthState.deleteMany({
      where: {
        workspaceId: input.workspaceId,
        provider: GOOGLE_CONTACTS_PROVIDER,
        OR: [{ expiresAt: { lte: new Date() } }, { usedAt: { not: null } }]
      }
    }),
    prisma.oAuthState.create({
      data: {
        workspaceId: input.workspaceId,
        provider: GOOGLE_CONTACTS_PROVIDER,
        tokenHash: hashToken(state),
        returnTo: encryptIntegrationCredentials({ returnTo: normalizedReturnTo(input.returnTo), codeVerifier }),
        expiresAt
      }
    })
  ]);

  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", env.googleClientId);
  url.searchParams.set("redirect_uri", env.googleRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

export async function consumeGoogleOAuthState(
  workspaceId: string,
  state: string
): Promise<{ returnTo: string; codeVerifier: string | null }> {
  const tokenHash = hashToken(state);
  const row = await prisma.oAuthState.findFirst({
    where: {
      workspaceId,
      provider: GOOGLE_CONTACTS_PROVIDER,
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    select: { id: true, returnTo: true }
  });
  if (!row) throw new Error("The Google connection request expired or was already used.");
  const claimed = await prisma.oAuthState.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() }
  });
  if (claimed.count !== 1) throw new Error("The Google connection request was already completed.");
  const storedState = row.returnTo;
  if (!storedState) return { returnTo: "/account", codeVerifier: null };
  try {
    const payload = decryptIntegrationCredentials<{ returnTo?: string; codeVerifier?: string }>(storedState);
    return {
      returnTo: normalizedReturnTo(payload.returnTo),
      codeVerifier: payload.codeVerifier?.trim() || null
    };
  } catch {
    return { returnTo: normalizedReturnTo(storedState), codeVerifier: null };
  }
}

async function tokenRequest(parameters: Record<string, string>): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok || payload.error) {
    throw new GoogleApiError(googleErrorMessage(payload, "Google rejected the token request."), response.status, payload);
  }
  return payload;
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
  existingRefreshToken?: string | null,
  codeVerifier?: string | null
): Promise<GoogleCredentials> {
  const parameters: Record<string, string> = {
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: env.googleRedirectUri,
    grant_type: "authorization_code"
  };
  if (codeVerifier) parameters.code_verifier = codeVerifier;
  const payload = await tokenRequest(parameters);
  if (!payload.access_token) throw new Error("Google did not return an access token.");
  const refreshToken = payload.refresh_token || existingRefreshToken || "";
  if (!refreshToken) throw new Error("Google did not return a refresh token. Reconnect and approve offline access.");
  return {
    accessToken: payload.access_token,
    accessTokenExpiresAt: new Date(Date.now() + Math.max(payload.expires_in ?? 3600, 60) * 1000).toISOString(),
    refreshToken,
    tokenType: payload.token_type ?? "Bearer",
    scope: payload.scope ?? GOOGLE_SCOPES.join(" ")
  };
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as GoogleUserInfo;
  if (!response.ok) throw new GoogleApiError(googleErrorMessage(payload, "Google account information could not be loaded."), response.status, payload);
  return payload;
}

export function encryptedGoogleCredentials(credentials: GoogleCredentials): string {
  return encryptIntegrationCredentials(credentials);
}

export function decryptedGoogleCredentials(connection: Pick<IntegrationConnection, "credentialsCiphertext">): GoogleCredentials {
  if (!connection.credentialsCiphertext) throw new Error("The Google connection does not contain credentials.");
  return decryptIntegrationCredentials<GoogleCredentials>(connection.credentialsCiphertext);
}

async function refreshGoogleAccessToken(
  connection: Pick<IntegrationConnection, "id" | "credentialsCiphertext">,
  force = false
): Promise<string> {
  const current = decryptedGoogleCredentials(connection);
  const expiresAt = new Date(current.accessTokenExpiresAt).getTime();
  if (!force && current.accessToken && Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000) {
    return current.accessToken;
  }
  try {
    const payload = await tokenRequest({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      refresh_token: current.refreshToken,
      grant_type: "refresh_token"
    });
    if (!payload.access_token) throw new Error("Google did not return a refreshed access token.");
    const next: GoogleCredentials = {
      ...current,
      accessToken: payload.access_token,
      accessTokenExpiresAt: new Date(Date.now() + Math.max(payload.expires_in ?? 3600, 60) * 1000).toISOString(),
      tokenType: payload.token_type ?? current.tokenType,
      scope: payload.scope ?? current.scope
    };
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        credentialsCiphertext: encryptIntegrationCredentials(next),
        status: "ACTIVE",
        lastError: null
      }
    });
    return next.accessToken;
  } catch (error) {
    await prisma.integrationConnection.updateMany({
      where: { id: connection.id },
      data: {
        status: "REVOKED",
        lastError: error instanceof Error ? error.message.slice(0, 1000) : "Google authorization was revoked."
      }
    });
    throw error;
  }
}

async function googleJson<T>(
  connection: Pick<IntegrationConnection, "id" | "credentialsCiphertext">,
  url: URL,
  retry = true
): Promise<T> {
  const accessToken = await refreshGoogleAccessToken(connection);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as T;
  if (response.status === 401 && retry) {
    const refreshed = await refreshGoogleAccessToken(connection, true);
    const second = await fetch(url, {
      headers: { Authorization: `Bearer ${refreshed}`, Accept: "application/json" },
      cache: "no-store"
    });
    const secondPayload = await second.json().catch(() => ({})) as T;
    if (!second.ok) throw new GoogleApiError(googleErrorMessage(secondPayload, "Google Contacts could not be loaded."), second.status, secondPayload);
    return secondPayload;
  }
  if (!response.ok) throw new GoogleApiError(googleErrorMessage(payload, "Google Contacts could not be loaded."), response.status, payload);
  return payload;
}

export async function listGoogleContactGroups(
  connection: Pick<IntegrationConnection, "id" | "credentialsCiphertext">
): Promise<GoogleContactGroup[]> {
  const groups: GoogleContactGroup[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${GOOGLE_PEOPLE_ENDPOINT}/contactGroups`);
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("groupFields", "metadata,groupType,memberCount,name");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const payload = await googleJson<{
      contactGroups?: Array<{ resourceName?: string; name?: string; groupType?: string; memberCount?: number }>;
      nextPageToken?: string;
    }>(connection, url);
    for (const item of payload.contactGroups ?? []) {
      if (!item.resourceName || !item.name) continue;
      groups.push({
        resourceName: item.resourceName,
        name: item.name,
        groupType: item.groupType ?? null,
        memberCount: Math.max(item.memberCount ?? 0, 0)
      });
    }
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return groups.sort((left, right) => left.name.localeCompare(right.name));
}

function nestedGoogleReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return null;
  const details = (error as Record<string, unknown>).details;
  if (!Array.isArray(details)) return null;
  for (const detail of details) {
    if (!detail || typeof detail !== "object") continue;
    const reason = (detail as Record<string, unknown>).reason;
    if (typeof reason === "string") return reason;
  }
  return null;
}

export function isExpiredGoogleSyncToken(error: unknown): boolean {
  return error instanceof GoogleApiError && nestedGoogleReason(error.payload) === "EXPIRED_SYNC_TOKEN";
}

async function listGoogleConnectionPages(
  connection: Pick<IntegrationConnection, "id" | "credentialsCiphertext">,
  syncToken: string | null,
  maxPeople?: number
): Promise<{ people: GooglePerson[]; nextSyncToken: string | null }> {
  const people: GooglePerson[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  do {
    const url = new URL(`${GOOGLE_PEOPLE_ENDPOINT}/people/me/connections`);
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("personFields", PERSON_FIELDS);
    url.searchParams.set("requestSyncToken", "true");
    url.searchParams.append("sources", "READ_SOURCE_TYPE_CONTACT");
    if (syncToken) url.searchParams.set("syncToken", syncToken);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const payload = await googleJson<{
      connections?: GooglePerson[];
      nextPageToken?: string;
      nextSyncToken?: string;
    }>(connection, url);
    people.push(...(payload.connections ?? []));
    pageToken = payload.nextPageToken;
    if (payload.nextSyncToken) nextSyncToken = payload.nextSyncToken;
    if (maxPeople && people.length >= maxPeople) {
      return { people: people.slice(0, maxPeople), nextSyncToken: null };
    }
  } while (pageToken);
  return { people, nextSyncToken };
}

export async function listGoogleConnections(input: {
  connection: Pick<IntegrationConnection, "id" | "credentialsCiphertext">;
  syncToken?: string | null;
  maxPeople?: number;
}): Promise<{ people: GooglePerson[]; nextSyncToken: string | null; fullSync: boolean }> {
  const requestedToken = input.syncToken ?? null;
  try {
    const result = await listGoogleConnectionPages(input.connection, requestedToken, input.maxPeople);
    return { ...result, fullSync: !requestedToken };
  } catch (error) {
    if (!requestedToken || !isExpiredGoogleSyncToken(error)) throw error;
    const result = await listGoogleConnectionPages(input.connection, null, input.maxPeople);
    return { ...result, fullSync: true };
  }
}

export function googlePersonInSelectedGroups(person: GooglePerson, selectedGroupResourceNames: string[]): boolean {
  if (!selectedGroupResourceNames.length) return true;
  const selected = new Set(selectedGroupResourceNames);
  return (person.memberships ?? []).some((membership) => {
    const resourceName = membership.contactGroupMembership?.contactGroupResourceName;
    return Boolean(resourceName && selected.has(resourceName));
  });
}

export function googlePersonToContactRecord(person: GooglePerson, sourceRow: number): GoogleContactRecord | null {
  const externalId = person.resourceName?.trim();
  if (!externalId) return null;
  const name = primaryFirst(person.names)[0];
  const organization = primaryFirst(person.organizations).find((item) => item.current) ?? primaryFirst(person.organizations)[0];

  const emailMap = new Map<string, { value: string; label: string | null; isPrimary: boolean }>();
  for (const item of primaryFirst(person.emailAddresses)) {
    const value = item.value?.trim();
    if (!value || !isValidEmail(value)) continue;
    const normalized = normalizeEmail(value);
    if (!emailMap.has(normalized)) {
      emailMap.set(normalized, { value, label: fieldLabel(item), isPrimary: Boolean(item.metadata?.primary) });
    }
  }
  const emails = ensureOnePrimary([...emailMap.values()]);

  const phoneMap = new Map<string, { value: string; label: string | null; isPrimary: boolean }>();
  for (const item of primaryFirst(person.phoneNumbers)) {
    const value = (item.canonicalForm || item.value || "").trim();
    const normalized = normalizePhone(value);
    if (!value || !normalized) continue;
    if (!phoneMap.has(normalized)) {
      phoneMap.set(normalized, { value, label: fieldLabel(item), isPrimary: Boolean(item.metadata?.primary) });
    }
  }
  const phones = ensureOnePrimary([...phoneMap.values()]);

  const addressMap = new Map<string, GoogleContactRecord["addresses"][number]>();
  for (const item of primaryFirst(person.addresses)) {
    const address = {
      label: fieldLabel(item),
      street1: clean(item.streetAddress || item.formattedValue, 240),
      street2: clean(item.extendedAddress, 240),
      city: clean(item.city, 120),
      state: clean(item.region, 120),
      postalCode: clean(item.postalCode, 40),
      country: clean(item.country, 120),
      isPrimary: Boolean(item.metadata?.primary)
    };
    if (!Object.values(address).some(Boolean)) continue;
    const key = [address.street1, address.street2, address.city, address.state, address.postalCode, address.country]
      .map((value) => (value ?? "").toLowerCase())
      .join("|");
    if (!addressMap.has(key)) addressMap.set(key, address);
  }
  const addresses = ensureOnePrimary([...addressMap.values()]);

  const biography = primaryFirst(person.biographies)[0];
  const publicNotes = biography?.value
    ? clean(biography.contentType === "TEXT_HTML" ? htmlToText(biography.value) : biography.value, 20_000)
    : null;

  const jumpDates: GoogleContactRecord["jumpDates"] = [];
  const birthday = primaryFirst(person.birthdays).find((item) => validGoogleDate(item.date));
  if (birthday?.date && validGoogleDate(birthday.date)) {
    jumpDates.push({
      dateTypeName: "Birthday",
      label: "Birthday",
      dateValue: logicalDate(birthday.date),
      month: birthday.date.month,
      day: birthday.date.day,
      recurrence: "YEARLY"
    });
  }
  for (const event of primaryFirst(person.events)) {
    if ((event.type ?? "").toLowerCase() !== "anniversary" || !validGoogleDate(event.date)) continue;
    jumpDates.push({
      dateTypeName: "Anniversary",
      label: fieldLabel(event) ?? "Anniversary",
      dateValue: logicalDate(event.date),
      month: event.date.month,
      day: event.date.day,
      recurrence: "YEARLY"
    });
  }

  const displayName = clean(name?.displayName, 240)
    ?? clean([name?.givenName, name?.familyName].filter(Boolean).join(" "), 240)
    ?? clean(organization?.name, 240)
    ?? emails[0]?.value
    ?? phones[0]?.value
    ?? null;
  const deleted = Boolean(person.metadata?.deleted);
  if (!deleted && !displayName) return null;

  const updatedAt = person.metadata?.sources
    ?.map((item) => item.updateTime)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const membershipResourceNames = [...new Set(
    (person.memberships ?? [])
      .map((item) => item.contactGroupMembership?.contactGroupResourceName)
      .filter((value): value is string => Boolean(value))
  )];

  return {
    rowId: `google-${stableImportHash(externalId)}`,
    sourceRow,
    externalId,
    etag: clean(person.etag, 500),
    deleted,
    updatedAt,
    membershipResourceNames,
    firstName: clean(name?.givenName, 120),
    lastName: clean(name?.familyName, 120),
    displayName,
    company: clean(organization?.name, 240),
    publicNotes,
    emails,
    phones,
    addresses,
    jumpDates
  };
}

export async function revokeGoogleCredentials(connection: Pick<IntegrationConnection, "credentialsCiphertext">): Promise<void> {
  if (!connection.credentialsCiphertext) return;
  const credentials = decryptedGoogleCredentials(connection);
  const token = credentials.refreshToken || credentials.accessToken;
  if (!token) return;
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok && response.status !== 400) {
    throw new Error("Google access could not be revoked. The local connection can still be removed.");
  }
}
