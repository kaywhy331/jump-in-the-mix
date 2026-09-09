import { randomUUID } from "node:crypto";
import { z } from "zod";
import { mkdir, open, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { privateJson, writeOperationsReceipt } from "./operations-artifacts.mjs";
import { operationsWebhook, postOperationsNotice } from "../../src/lib/operations-notifications";

const savedState = z.object({ version: z.literal(1), unavailable: z.boolean(), eventId: z.string().uuid(), kind: z.enum(["OPENED", "REMINDER", "RESOLVED"]), attempts: z.number().int().min(0).max(5), nextAttemptAt: z.string().datetime(), openedAt: z.string().datetime(), accepted: z.boolean(), lastReminderAt: z.string().datetime() }).strict();
// The independent monitor needs a tiny durable local state file when PostgreSQL
// itself is down. It contains no connection strings, recipient data or secrets.
export async function reportMonitorAvailability(available: boolean, statePath: string, now = new Date()) {
  const path = resolve(statePath), lockPath = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // A crashed process cannot hold this ten-minute lease forever. Remove only
    // an expired lease; the next invocation competes for the atomic create.
    const existing = await stat(lockPath).catch(() => null);
    if (existing && existing.mtimeMs < now.getTime() - 10 * 60_000) await rm(lockPath, { force: true });
    return { accepted: false, busy: true };
  }
  try {
    type State = z.infer<typeof savedState>;
    let state: State | null = null;
    try { state = savedState.parse(await privateJson(path, 16 * 1024)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("The independent monitor state file could not be read."); }
    if (!state && available) return { accepted: false };
    const lockInfo = await lock.stat();
    const stillOwned = async () => { try { const current = await stat(lockPath); return current.ino === lockInfo.ino && current.mtimeMs >= Date.now() - 10 * 60_000; } catch { return false; } };
    const persist = async (value: State) => { if (!await stillOwned()) throw new Error("Independent monitor state lease expired."); await writeOperationsReceipt(path, value); };
    const newIncident = !available && (!state || !state.unavailable);
    const recovered = available && state?.unavailable;
    const reminder = !available && state && now.getTime() - new Date(state.lastReminderAt).getTime() >= 24 * 3600_000;
    const recoveryWithoutNotice = recovered && state?.attempts === 0;
    if (newIncident || recovered || reminder) state = { version: 1, unavailable: !available, eventId: randomUUID(), kind: recovered ? "RESOLVED" : reminder ? "REMINDER" : "OPENED", attempts: 0, nextAttemptAt: now.toISOString(), openedAt: newIncident ? now.toISOString() : state!.openedAt, accepted: Boolean(recoveryWithoutNotice), lastReminderAt: now.toISOString() };
    if (state && (newIncident || recovered || reminder)) await persist(state);
    if (!state || state.accepted || state.attempts >= 5 || new Date(state.nextAttemptAt) > now) return { accepted: false };
    const destination = operationsWebhook();
    if (!destination) { await persist(state); return { accepted: false }; }
    state.attempts++; state.nextAttemptAt = new Date(now.getTime() + Math.min(3600, 60 * 2 ** state.attempts) * 1000).toISOString();
    await persist(state); // Reserve before HTTP, including uncertain attempts.
    const result = await postOperationsNotice(destination, { id: state.eventId, code: "monitor", kind: state.kind, state: available ? "OK" : "CRITICAL", observedAt: now.toISOString(), evidence: { unavailable: Number(!available) } });
    if (result.accepted) { state.accepted = true; await persist(state); }
    return result;
  } finally { const inode = (await lock.stat()).ino; await lock.close(); if (await stat(lockPath).then(info => info.ino === inode, () => false)) await rm(lockPath, { force: true }); }
}
