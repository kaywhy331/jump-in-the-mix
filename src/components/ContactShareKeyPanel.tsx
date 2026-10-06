"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AppIcon } from "@/components/AppIcon";
import { CopyField } from "@/components/CopyField";
import { Notice } from "@/components/Notice";
import { useConfirmDialog } from "@/components/useConfirmDialog";
import { makeContactShareKeyAction, removeContactShareKeyAction, type ContactShareKeyResult } from "@/lib/contact-share-key-actions";

/** Steps for the iPhone shortcut that adds contacts shared from the Contacts app. The key is shown once. */
export function ContactShareKeyPanel({ title, shortcutUrl, keyStatus, viewOnly }: { title: string; shortcutUrl: string; keyStatus: { made: string; lastUsed: string | null } | null; viewOnly: boolean }) {
  const keyMade = Boolean(keyStatus);
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirmDialog();
  const keyRef = useRef<HTMLDivElement>(null);
  // The Make button disappears once the key shows, so move focus to the key itself.
  useEffect(() => { if (key) keyRef.current?.querySelector("input")?.focus(); }, [key]);

  const makeKey = async () => {
    if (keyMade && !await confirm({ title: "Make a new key?", description: "Your current key stops working. Paste the new one into the shortcut when you add it again.", confirmLabel: "Make a new key", danger: true })) return;
    startTransition(async () => {
      setError("");
      const result: ContactShareKeyResult = await makeContactShareKeyAction().catch(() => ({ error: "The key could not be made. Try again." }));
      if (result.key) { setKey(result.key); router.refresh(); }
      else setError(result.error ?? "The key could not be made. Try again.");
    });
  };

  const turnOff = async () => {
    if (!await confirm({ title: "Turn off the shortcut?", description: "Your key stops working, so the shortcut can no longer add people.", confirmLabel: "Turn off", danger: true })) return;
    startTransition(async () => {
      setError("");
      const result: ContactShareKeyResult = await removeContactShareKeyAction().catch(() => ({ error: "The key could not be removed. Try again." }));
      if (result.removed) { setKey(""); router.refresh(); }
      else setError(result.error ?? "The key could not be removed. Try again.");
    });
  };

  return (
    <section className="card phone-share-card" aria-labelledby="phone-share-shortcut">
      <h2 id="phone-share-shortcut">{title}</h2>
      <p>Set this up once. Then share any contact straight to Jump in the Mix.</p>
      <ol className="phone-share-steps">
        <li>
          <strong>Make your key</strong>
          {key
            ? <><div ref={keyRef}><CopyField label="Key" value={key} secret /></div><small>Keep it private. Anyone with it can add people to your Contacts and add details to people already there.</small></>
            : keyMade
              ? <small>Made {keyStatus?.made}{keyStatus?.lastUsed ? `, last used ${keyStatus.lastUsed}` : ", not used yet"}.</small>
              : <small>The shortcut uses it to add people to your account.</small>}
          {!key && <div className="form-actions"><button className="button" type="button" onClick={() => void makeKey()} disabled={pending || viewOnly}>{keyMade ? "Make a new key" : "Make my key"}</button></div>}
        </li>
        <li>
          <strong>Add the shortcut</strong>
          <small>Paste your key when the Shortcuts app asks for it.</small>
          {shortcutUrl
            ? <div className="form-actions"><a className="button" href={shortcutUrl} target="_blank" rel="noopener noreferrer">Get the shortcut<AppIcon name="external" /></a></div>
            : <small>The shortcut link isn&apos;t available yet.</small>}
        </li>
        <li>
          <strong>Share a contact</strong>
          <small>In Contacts, open a person, tap Share Contact, then tap Add to Jump in the Mix.</small>
        </li>
      </ol>
      {error && <Notice type="error">{error}</Notice>}
      {keyMade && <button className="text-button" type="button" onClick={() => void turnOff()} disabled={pending || viewOnly}>Turn off the shortcut</button>}
      {confirmDialog}
    </section>
  );
}
