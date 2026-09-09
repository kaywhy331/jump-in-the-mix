"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ContactForm } from "@/components/ContactForm";
import { Notice } from "@/components/Notice";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";
import { takeCaptureDraft } from "@/lib/capture-draft";
import { splitContactName, type QuickAddInterpretation } from "@/lib/quick-add-capture";

export function NewContactForm({ draftId, ...props }: { draftId?: string } & Omit<ComponentProps<typeof ContactForm>, "mode" | "contact">) {
  const scope = useBrowserScope();
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<QuickAddInterpretation | null>(null);
  const read = useRef<{ key: string; value: QuickAddInterpretation | null } | null>(null);
  useEffect(() => {
    const key = `${scope}:${draftId}`;
    // React Strict Mode can repeat setup. Consumption is still once per mount.
    if (read.current?.key !== key) read.current = { key, value: draftId ? takeCaptureDraft(scope, draftId) : null };
    setDraft(read.current.value); setLoaded(true);
  }, [scope, draftId]);
  if (draftId && !loaded) return <p role="status">Opening your draft…</p>;
  const names = splitContactName(draft?.name);
  const contact = draft ? { ...names, publicNotes: draft.original,
    phones: draft.phone ? [{ phone: draft.phone, label: "Mobile", isPrimary: true }] : undefined,
    emails: draft.email ? [{ email: draft.email, label: "Email", isPrimary: true }] : undefined
  } : undefined;
  return <>
    {draft && <Notice type="info">Review the details from Quick Add before saving. This draft is kept only in this open form; reloading clears it.</Notice>}
    {draftId && !draft && <Notice type="info">This temporary draft is no longer available in this tab. You can enter the details here or use Quick Add again.</Notice>}
    <ContactForm key={draftId ?? "new"} {...props} mode="create" contact={contact} followUp={props.followUp ? { ...props.followUp, defaultDate: draft?.dateValue ?? undefined, defaultReason: draft?.reason.slice(0, 240) || "Follow up" } : null} />
  </>;
}
