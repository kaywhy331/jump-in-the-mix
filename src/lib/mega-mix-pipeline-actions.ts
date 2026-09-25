"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import type { FormResult } from "@/lib/form-errors";
import { createMegaMixPipeline, deleteMegaMixPipeline, duplicateMegaMixPipeline, importPortable, updateMegaMixPipeline } from "@/lib/mega-mix-pipeline-service";
import { parsePortable, portableSummary } from "@/lib/mix-portable";
import { UserFacingError } from "@/lib/user-facing-error";

const refresh = () => { revalidatePath("/mixes"); revalidatePath("/mixes/mega"); revalidatePath("/journey"); };
/** Refusals our own code writes are shown as they are; database and unexpected errors get the plain fallback. */
const failed = (error: unknown, fallback: string): FormResult => ({ error: error instanceof UserFacingError ? error.message : fallback });

async function writer() {
  const session = await requireWorkspace();
  if (session.impersonation) throw new UserFacingError("Administrator support sessions are view-only.");
  return session;
}

export async function saveMegaMixAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  let id = String(data.get("pipelineId") ?? "");
  try {
    const { workspace, user } = await writer();
    const input = { workspaceId: workspace.id, actorUserId: user.id, name: String(data.get("name") ?? ""), description: String(data.get("description") ?? ""), mixIds: data.getAll("mixId").map(String) };
    if (id) await updateMegaMixPipeline({ ...input, pipelineId: id });
    else id = (await createMegaMixPipeline(input)).id;
  } catch (error) { return failed(error, "The Mega-Mix could not be saved. Your changes are still here."); }
  refresh();
  redirect(`/mixes/mega?megaMix=${encodeURIComponent(id)}&saved=1`);
}

export async function deleteMegaMixAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  try {
    const { workspace, user } = await writer();
    await deleteMegaMixPipeline({ workspaceId: workspace.id, actorUserId: user.id, pipelineId: String(data.get("pipelineId") ?? "") });
  } catch (error) { return failed(error, "The Mega-Mix could not be removed."); }
  refresh();
  redirect("/mixes/mega?removed=1");
}

export async function duplicateMegaMixAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  let id: string | null = null;
  try {
    const { workspace, user } = await writer();
    id = (await duplicateMegaMixPipeline({ workspaceId: workspace.id, actorUserId: user.id, pipelineId: String(data.get("pipelineId") ?? ""), name: String(data.get("name") ?? "") })).pipelineId;
  } catch (error) { return failed(error, "The copy could not be made."); }
  refresh();
  redirect(`/mixes/mega?megaMix=${encodeURIComponent(id ?? "")}&copied=1`);
}

export type ImportPreview = { error?: string; kind?: "mix" | "mega-mix"; name?: string; mixes?: Array<{ name: string; beats: number }>; summary?: ReturnType<typeof portableSummary> };

/** Check a file without saving anything, so the owner can review it before adding it. */
export async function previewImportAction(_previous: ImportPreview, data: FormData): Promise<ImportPreview> {
  try {
    await writer();
    const value = parsePortable(String(data.get("file") ?? ""));
    return { kind: value.kind, name: value.name, summary: portableSummary(value), mixes: value.mixes.map(mix => ({ name: mix.name, beats: mix.steps.length })) };
  } catch (error) { return failed(error, "This file could not be read."); }
}

export async function importFileAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  let target = "/mixes";
  try {
    const { workspace, user } = await writer();
    if (data.get("reviewed") !== "on") return { error: "Review what will be added before importing." };
    const value = parsePortable(String(data.get("file") ?? ""));
    const result = await importPortable({ workspaceId: workspace.id, actorUserId: user.id, value, name: String(data.get("name") ?? value.name), origin: "FILE", source: "mixes.import" });
    target = result.pipelineId ? `/mixes/mega?megaMix=${encodeURIComponent(result.pipelineId)}&imported=1` : `/mixes/${encodeURIComponent(result.mixIds[0])}/edit?imported=1`;
  } catch (error) { return failed(error, "That file couldn’t be added. Check it and try again."); }
  refresh();
  redirect(target);
}
