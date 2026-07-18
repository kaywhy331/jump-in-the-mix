"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const desiredProperties = ["name", "email", "tel", "address"] as const;
type ContactProperty = (typeof desiredProperties)[number];

type NativeContactAddress = {
  addressLine?: string[];
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
};

type NativeContact = {
  name?: string[];
  email?: string[];
  tel?: string[];
  address?: NativeContactAddress[];
};

type ContactsManager = {
  getProperties?: () => Promise<string[]>;
  select: (properties: ContactProperty[], options: { multiple: boolean }) => Promise<NativeContact[]>;
};

type QuickAddItem = {
  rowId: string;
  displayName: string;
  matchKind: "NONE" | "EXACT" | "AMBIGUOUS" | "FUZZY";
  status: "CREATED" | "MERGED" | "REPLACED" | "SKIPPED" | "FAILED";
  message: string;
  existingContactName: string | null;
};

type QuickAddSummary = {
  selected: number;
  created: number;
  merged: number;
  reviewNeeded: number;
  skipped: number;
  failed: number;
};

type QuickAddResponse = {
  error?: string;
  summary?: QuickAddSummary;
  items?: QuickAddItem[];
};

function contactsManager(): ContactsManager | null {
  if (typeof navigator === "undefined") return null;
  const manager = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  return manager && typeof manager.select === "function" ? manager : null;
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readableError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Contact access was not granted. You can still use the compact manual form.";
  }
  return error instanceof Error ? error.message : "The device Contact Picker could not be opened.";
}

export function DeviceContactQuickAdd() {
  const router = useRouter();
  const [support, setSupport] = useState<"detecting" | "supported" | "unsupported">("detecting");
  const [properties, setProperties] = useState<ContactProperty[]>([]);
  const [phase, setPhase] = useState<"idle" | "picking" | "saving">("idle");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<QuickAddSummary | null>(null);
  const [reviewItems, setReviewItems] = useState<QuickAddItem[]>([]);

  useEffect(() => {
    let active = true;
    const detect = async () => {
      const manager = contactsManager();
      if (!window.isSecureContext || !manager) {
        if (active) setSupport("unsupported");
        return;
      }
      try {
        const available = manager.getProperties ? await manager.getProperties() : [...desiredProperties];
        const next = desiredProperties.filter((property) => available.includes(property));
        if (!active) return;
        setProperties(next);
        setSupport(next.length ? "supported" : "unsupported");
      } catch {
        if (!active) return;
        // Some implementations expose select() but not getProperties() reliably.
        // Keep the progressive enhancement available and let select() report a
        // concrete browser error after the user's explicit gesture.
        setProperties([...desiredProperties]);
        setSupport("supported");
      }
    };
    void detect();
    return () => { active = false; };
  }, []);

  const pickContacts = async () => {
    const manager = contactsManager();
    if (!manager || !properties.length) {
      setSupport("unsupported");
      return;
    }

    setError("");
    setSummary(null);
    setReviewItems([]);
    setPhase("picking");
    try {
      // Call select() directly inside the click handler so the browser retains
      // the transient user activation required by the Contact Picker API.
      const selected = await manager.select(properties, { multiple: true });
      if (!selected.length) {
        setPhase("idle");
        return;
      }
      if (selected.length > 50) {
        throw new Error("Quick Add accepts up to 50 Contacts at once. Use CSV / VCF import for a larger address book.");
      }

      setPhase("saving");
      const response = await fetch("/api/contacts/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: requestId(),
          contacts: selected.map((contact) => ({
            names: contact.name ?? [],
            emails: contact.email ?? [],
            phones: contact.tel ?? [],
            addresses: (contact.address ?? []).map((address) => ({
              addressLines: address.addressLine ?? [],
              city: address.city ?? null,
              region: address.region ?? null,
              postalCode: address.postalCode ?? null,
              country: address.country ?? null
            }))
          }))
        })
      });
      const payload = await response.json().catch(() => null) as QuickAddResponse | null;
      if (!response.ok || !payload?.summary) throw new Error(payload?.error ?? "The selected Contacts could not be added.");

      setSummary(payload.summary);
      setReviewItems((payload.items ?? []).filter((item) => item.matchKind === "AMBIGUOUS" || item.matchKind === "FUZZY"));
      router.refresh();
    } catch (nextError) {
      setError(readableError(nextError));
    } finally {
      setPhase("idle");
    }
  };

  if (support === "detecting") {
    return (
      <div className="device-contact-quick-add">
        <button className="settings-hub-card device-contact-picker" type="button" disabled>
          <span className="settings-hub-icon">◎</span>
          <span><strong>Quick Add</strong><small>Checking device support…</small></span>
        </button>
      </div>
    );
  }

  if (support === "unsupported") {
    return (
      <div className="device-contact-quick-add">
        <Link className="settings-hub-card device-contact-picker" href="/contacts/new?quickAddFallback=1">
          <span className="settings-hub-icon">◎</span>
          <span><strong>Quick Add</strong><small>Use the fast manual form on this browser.</small></span>
        </Link>
      </div>
    );
  }

  return (
    <div className="device-contact-quick-add">
      <button
        className="settings-hub-card device-contact-picker"
        type="button"
        onClick={pickContacts}
        disabled={phase !== "idle"}
        aria-busy={phase !== "idle"}
      >
        <span className="settings-hub-icon">◎</span>
        <span>
          <strong>{summary ? "Pick more from device" : "Pick from device"}</strong>
          <small>{phase === "picking" ? "Opening your address book…" : phase === "saving" ? "Adding selected Contacts…" : "Choose one or more without leaving the app."}</small>
        </span>
      </button>

      {error && (
        <div className="quick-add-result error" role="alert">
          <span>{error}</span>
          <Link href="/contacts/new?quickAddFallback=1">Open manual form</Link>
        </div>
      )}
      {summary && (
        <div className="quick-add-result" role="status">
          <strong>{summary.created} added · {summary.merged} merged</strong>
          <span>
            {summary.failed ? `${summary.failed} could not be added. ` : ""}
            {summary.reviewNeeded
              ? `${summary.reviewNeeded} possible duplicate${summary.reviewNeeded === 1 ? " was" : "s were"} left unchanged.`
              : "Exact email and phone matches were merged without overwriting existing primary values."}
          </span>
          {reviewItems.length > 0 && (
            <details className="quick-add-review">
              <summary>Review possible duplicates</summary>
              <div>
                {reviewItems.map((item) => (
                  <span key={item.rowId}>
                    <strong>{item.displayName}</strong>
                    <small>{item.existingContactName ? `Possible match: ${item.existingContactName}` : item.message}</small>
                  </span>
                ))}
              </div>
              <Link href="/contacts">Review Contacts or add the person manually</Link>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
