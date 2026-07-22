"use client";

import { useRef } from "react";
import { switchWorkspaceAction } from "@/lib/workspace-selection-actions";

export function WorkspaceSwitcher({
  activeWorkspaceId,
  workspaces
}: {
  activeWorkspaceId: string;
  workspaces: Array<{ id: string; name: string; role: string }>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  if (workspaces.length <= 1) return null;
  return (
    <form ref={formRef} action={switchWorkspaceAction} className="workspace-switcher">
      <input type="hidden" name="returnTo" value="/jumps" />
      <label htmlFor="active-workspace"><span className="sr-only">Active workspace</span><select id="active-workspace" name="workspaceId" defaultValue={activeWorkspaceId} onChange={() => formRef.current?.requestSubmit()}>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name} · {workspace.role.toLowerCase()}</option>)}</select></label>
      <button className="sr-only" type="submit">Switch workspace</button>
    </form>
  );
}
