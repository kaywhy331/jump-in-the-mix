"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { saveLibraryDraft, releaseLibraryVersion } from "@/lib/library-admin";
import { LibraryError, validateLibraryContent } from "@/lib/library-content";
import { SharedMixContentError } from "@/lib/shared-mix";

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
function fail(path: string, error: unknown): never {
  if (error instanceof LibraryError && error.needsMfa) redirect(`/account/admin-mfa?verify=1&returnTo=${encodeURIComponent(path)}`);
  if (error instanceof Error && "digest" in error) throw error;
  const message = error instanceof LibraryError || error instanceof SharedMixContentError ? error.message.slice(0, 500) : "The library change could not be saved. Please try again later.";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function saveSharedMixAdminAction(data: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("mixes.edit");
  const id = value(data, "sharedMixId");
  const path = id ? `/admin/templates/${encodeURIComponent(id)}/edit` : "/admin/templates/new";
  const rate = await consumeRateLimit({ scope: "library.draft", identifiers: [user.id], limit: 30, windowMs: 15 * 60_000 });
  if (!rate.allowed) fail(path, new LibraryError("Too many draft saves. Try again later."));
  let result;
  try {
    const rows = (key: string) => data.getAll(key).map(String);
    const names = rows("stepName"), channels = rows("stepChannel"), offsets = rows("stepDayOffset"), times = rows("stepSendTimeMinutes"), subjects = rows("stepSubject"), bodies = rows("stepBody"), scripts = rows("stepScript");
    const optout = new Set(rows("stepOptOut")), longSms = new Set(rows("stepLongSms"));
    if ([channels, offsets, times, subjects, bodies, scripts].some(row => row.length !== names.length)) throw new LibraryError("A beat is incomplete. Reload the editor and try again.");
    const nullable = (text: string | undefined) => text?.trim() || null;
    const content = validateLibraryContent({ title: value(data, "title"), description: value(data, "description"), category: value(data, "category"), industry: value(data, "industry"), framework: nullable(value(data, "framework")),
      triggerMode: value(data, "triggerMode"), dateTypeName: nullable(value(data, "dateTypeName")), dateTypeSlug: nullable(value(data, "dateTypeSlug")), featured: data.get("featured") === "on",
      steps: names.map((name, i) => ({ name, channel: channels[i], dayOffset: offsets[i]?.trim() ? Number(offsets[i]) : NaN,
        sendTimeMinutes: times[i]?.trim() ? Number(times[i]) : null, subject: nullable(subjects[i]), body: nullable(bodies[i]), script: nullable(scripts[i]), includeOptOut: optout.has(String(i)), longSms: longSms.has(String(i)) })) });
    result = await saveLibraryDraft({ actorUserId: user.id, actorSessionId: session.id, sharedMixId: id || undefined, expectedRevision: Number(value(data, "revision")), content, reason: value(data, "reason") });
  } catch (error) { fail(path, error); }
  revalidatePath("/admin/templates");
  redirect(`/admin/templates/${result.id}/edit?saved=${result.version}`);
}

export async function releaseSharedMixAction(data: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin(["mixes.edit", "mixes.publish"]);
  const id = value(data, "sharedMixId"), path = `/admin/templates/${encodeURIComponent(id)}/edit`;
  const rate = await consumeRateLimit({ scope: "library.release", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) fail(path, new LibraryError("Too many publication attempts. Try again later."));
  let result;
  try {
    result = await releaseLibraryVersion({ actorUserId: user.id, actorSessionId: session.id, sharedMixId: id, expectedRevision: Number(value(data, "revision")), version: Number(value(data, "version")),
      operation: value(data, "operation") as "publish" | "rollback" | "unpublish", reason: value(data, "reason"), password: String(data.get("currentPassword") ?? "") });
  } catch (error) { fail(path, error); }
  revalidatePath("/admin/templates", "layout"); revalidatePath("/templates", "layout");
  redirect(`${path}?released=${result.revision}`);
}
