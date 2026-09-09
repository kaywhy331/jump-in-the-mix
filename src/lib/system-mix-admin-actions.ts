"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { releaseSystemMix, saveSystemMixDraft } from "@/lib/system-mix-admin";
import { SystemMixError } from "@/lib/system-mix";
const path = "/admin/system-mix";
const value = (data: FormData, key: string) => String(data.get(key) ?? "");
function fail(error: unknown): never {
  if (error instanceof SystemMixError && error.needsMfa) redirect(`/account/admin-mfa?verify=1&returnTo=${encodeURIComponent(path)}`);
  if (error instanceof Error && "digest" in error) throw error;
  redirect(`${path}?error=${encodeURIComponent(error instanceof SystemMixError ? error.message.slice(0, 500) : "System Mix could not be updated. Please try again later.")}`);
}
export async function saveSystemMixDraftAction(data: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("mixes.edit");
  if (!(await consumeRateLimit({ scope: "system_mix.draft", identifiers: [user.id], limit: 30, windowMs: 15 * 60_000 })).allowed) fail(new SystemMixError("Too many draft saves. Please try again later."));
  let result;
  try { result = await saveSystemMixDraft({ actorUserId: user.id, actorSessionId: session.id, reason: value(data, "reason"), expectedRevision: Number(value(data, "revision")), content: { subject: value(data, "subject"), body: value(data, "body") } }); }
  catch (error) { fail(error); }
  revalidatePath(path); redirect(`${path}?saved=${result.version}`);
}
export async function releaseSystemMixAction(data: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin(["mixes.edit", "mixes.publish"]);
  if (!(await consumeRateLimit({ scope: "system_mix.release", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 })).allowed) fail(new SystemMixError("Too many publication attempts. Please try again later."));
  let result;
  try { result = await releaseSystemMix({ actorUserId: user.id, actorSessionId: session.id, reason: value(data, "reason"), expectedRevision: Number(value(data, "revision")), version: Number(value(data, "version")), password: value(data, "password"), operation: value(data, "operation") as "publish" | "rollback" }); }
  catch (error) { fail(error); }
  revalidatePath(path); revalidatePath("/mixes/system"); redirect(`${path}?released=${result.revision}`);
}
