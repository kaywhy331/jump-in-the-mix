import { Prisma } from "@/generated/prisma/client";
import { detachedTokens } from "@/lib/draft-segments";
import { buildJumpReplacementValues } from "@/lib/jump-render";
import { prisma } from "@/lib/prisma";
import { DRAFT_LIMITS, draftFieldsForFamily, isPreparationFamily, preparationFamilyForChannel, type DraftContent, type PreparationFamily } from "@/lib/preparation-family";

/** Template tokens a draft no longer carries, each with the value it resolved to when it was removed. */
export type DetachedTokens = Record<string, string>;

export type DraftRecord = DraftContent & {
  family: PreparationFamily;
  revision: number;
  stepVersionId: string;
  detached: DetachedTokens | null;
  updatedAt: Date;
};

function detachedOf(value: Prisma.JsonValue | null | undefined): DetachedTokens | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length ? Object.fromEntries(entries) : null;
}

function withDetached<T extends { detached: Prisma.JsonValue | null }>(row: T): Omit<T, "detached"> & { detached: DetachedTokens | null } {
  return { ...row, detached: detachedOf(row.detached) };
}

/** The values the follow-up's tokens resolve to right now, from the bound contact and business. */
async function currentTokenValues(jumpId: string): Promise<Record<string, string>> {
  const jump = await prisma.jump.findUniqueOrThrow({
    where: { id: jumpId },
    select: {
      contact: { include: { emails: true, phones: true, addresses: true, customFieldValues: { include: { definition: true } } } },
      workspace: { include: { profile: true, owner: { select: { name: true, email: true } } } },
      stepVersion: { select: { stepTemplate: { select: { channel: true } } } }
    }
  });
  return buildJumpReplacementValues(jump.contact, jump.workspace.profile, jump.workspace.owner, jump.stepVersion.stepTemplate.channel);
}

function templateTextOf(snapshot: Prisma.JsonValue, key: "subject" | "body" | "script"): string {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return "";
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

/**
 * Tokens the plan used that this draft dropped, each with the value it shows right now. A token
 * already recorded keeps the value from when it was first removed; a token put back is forgotten.
 */
async function detachedForSave(jumpId: string, template: Prisma.JsonValue, fields: DraftContent, previous: DetachedTokens | null): Promise<DetachedTokens | null> {
  const removed = new Set<string>();
  for (const key of ["subject", "body", "script"] as const) {
    const source = fields[key];
    if (source === null) continue;
    for (const token of detachedTokens(templateTextOf(template, key), source)) removed.add(token);
  }
  if (!removed.size) return null;
  const fresh = [...removed].filter((token) => !previous || !Object.hasOwn(previous, token));
  const values = fresh.length ? await currentTokenValues(jumpId) : {};
  const detached: DetachedTokens = {};
  for (const token of removed) detached[token] = previous && Object.hasOwn(previous, token) ? previous[token] : values[token] ?? "";
  return detached;
}

export type SaveDraftInput = {
  workspaceId: string;
  jumpId: string;
  family: unknown;
  subject?: unknown;
  body?: unknown;
  script?: unknown;
  /** The revision the client last saw, or null when it has no draft yet. */
  revision?: unknown;
};

export type DraftFailure = { ok: false; reason: "invalid" | "unavailable" | "conflict"; message: string; draft: DraftRecord | null };
export type SaveDraftResult = { ok: true; draft: DraftRecord } | DraftFailure;
export type DiscardDraftResult = { ok: true } | DraftFailure;

const draftSelect = { family: true, subject: true, body: true, script: true, revision: true, stepVersionId: true, detached: true, updatedAt: true } satisfies Prisma.JumpDraftSelect;

function text(value: unknown, maximum: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maximum) throw new RangeError("Draft text is too long.");
  return value;
}

function revisionOf(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new RangeError("Draft revision is invalid.");
  return value;
}

const invalid = (message: string): DraftFailure => ({ ok: false, reason: "invalid", message, draft: null });
const unavailable = (message = "This follow-up is no longer open, so its message can't be edited."): DraftFailure => ({ ok: false, reason: "unavailable", message, draft: null });

async function currentDraft(jumpId: string, family: PreparationFamily): Promise<DraftRecord | null> {
  const row = await prisma.jumpDraft.findUnique({ where: { jumpId_family: { jumpId, family } }, select: draftSelect });
  return row ? withDetached(row) : null;
}

/** Drafts for the given follow-ups, keyed by follow-up id. Only the caller's workspace is read. */
export async function readJumpDrafts(workspaceId: string, jumpIds: string[]): Promise<Map<string, DraftRecord[]>> {
  const byJump = new Map<string, DraftRecord[]>();
  if (!jumpIds.length) return byJump;
  const rows = await prisma.jumpDraft.findMany({ where: { workspaceId, jumpId: { in: jumpIds } }, select: { ...draftSelect, jumpId: true } });
  for (const { jumpId, ...draft } of rows) byJump.set(jumpId, [...(byJump.get(jumpId) ?? []), withDetached(draft)]);
  return byJump;
}

/**
 * Saves the owner's draft for one follow-up and family. The row is overwritten in place with an
 * optimistic revision: a save that carries a stale revision is refused and the current draft is
 * returned, so two devices never overwrite each other silently. Only a pending follow-up in the
 * caller's workspace accepts a draft, and only for the family its channel uses.
 */
export async function saveJumpDraft(input: SaveDraftInput): Promise<SaveDraftResult> {
  if (!isPreparationFamily(input.family)) return invalid("Choose a valid message type.");
  const family = input.family;
  let fields: DraftContent;
  let revision: number | null;
  try {
    fields = draftFieldsForFamily(family, {
      subject: text(input.subject, DRAFT_LIMITS.subject) ?? null,
      body: text(input.body, DRAFT_LIMITS.body) ?? null,
      script: text(input.script, DRAFT_LIMITS.script) ?? null
    });
    revision = revisionOf(input.revision);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "The draft could not be read.");
  }

  const jump = await prisma.jump.findFirst({
    where: { id: input.jumpId, workspaceId: input.workspaceId, status: "PENDING" },
    select: { stepVersionId: true, templateSnapshot: true, stepVersion: { select: { stepTemplate: { select: { channel: true } } } } }
  });
  if (!jump) return unavailable();
  if (preparationFamilyForChannel(jump.stepVersion.stepTemplate.channel) !== family) return unavailable("This follow-up doesn't use that kind of message.");

  if (revision === null) {
    const detached = await detachedForSave(input.jumpId, jump.templateSnapshot, fields, null);
    try {
      const draft = await prisma.jumpDraft.create({
        data: { jumpId: input.jumpId, family, workspaceId: input.workspaceId, stepVersionId: jump.stepVersionId, ...fields, detached: detached ?? Prisma.DbNull },
        select: draftSelect
      });
      return { ok: true, draft: withDetached(draft) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { ok: false, reason: "conflict", message: "This message was edited somewhere else. Showing the latest version.", draft: await currentDraft(input.jumpId, family) };
      }
      throw error;
    }
  }

  const previous = await currentDraft(input.jumpId, family);
  const detached = await detachedForSave(input.jumpId, jump.templateSnapshot, fields, previous?.detached ?? null);
  const updated = await prisma.jumpDraft.updateMany({
    where: { jumpId: input.jumpId, family, workspaceId: input.workspaceId, revision },
    data: { ...fields, detached: detached ?? Prisma.DbNull, revision: { increment: 1 } }
  });
  if (updated.count !== 1) {
    const draft = await currentDraft(input.jumpId, family);
    return { ok: false, reason: "conflict", message: draft ? "This message was edited somewhere else. Showing the latest version." : "These edits were discarded somewhere else.", draft };
  }
  const draft = await currentDraft(input.jumpId, family);
  if (!draft) return unavailable();
  return { ok: true, draft };
}

/** Removes the owner's draft so the follow-up falls back to its plan's message. Guarded on the revision the client saw. */
export async function discardJumpDraft(input: { workspaceId: string; jumpId: string; family: unknown; revision: unknown }): Promise<DiscardDraftResult> {
  if (!isPreparationFamily(input.family)) return invalid("Choose a valid message type.");
  let revision: number | null;
  try { revision = revisionOf(input.revision); } catch (error) { return invalid(error instanceof Error ? error.message : "The draft could not be read."); }
  if (revision === null) return invalid("Say which version of the draft to discard.");
  const deleted = await prisma.jumpDraft.deleteMany({ where: { jumpId: input.jumpId, family: input.family, workspaceId: input.workspaceId, revision } });
  if (deleted.count === 1) return { ok: true };
  const draft = await prisma.jumpDraft.findFirst({ where: { jumpId: input.jumpId, family: input.family, workspaceId: input.workspaceId }, select: draftSelect });
  if (!draft) return { ok: true };
  return { ok: false, reason: "conflict", message: "This message was edited somewhere else. Showing the latest version.", draft: withDetached(draft) };
}
