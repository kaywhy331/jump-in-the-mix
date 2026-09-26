"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import type { MixFavoriteTarget } from "@/lib/mix-favorites";

export function MixFavoriteButton({ target, name, initial, canEdit = true }: { target: MixFavoriteTarget; name: string; initial: boolean; canEdit?: boolean }) {
  const router = useRouter(), [favorite, setFavorite] = useState(initial), [saving, setSaving] = useState(false), [error, setError] = useState("");
  useEffect(() => setFavorite(initial), [initial]);
  const label = favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`;
  return <div className="mix-favorite-control"><button className="icon-button mix-favorite" type="button" disabled={saving || !canEdit} aria-label={label} title={label} aria-pressed={favorite} onClick={async () => {
    setSaving(true); setError("");
    try { const response = await fetch("/api/mixes/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...target, favorite: !favorite }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setFavorite(data.favorite); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this favorite. Try again."); }
    finally { setSaving(false); }
  }}><AppIcon name="heart" fill={favorite ? "currentColor" : "none"} /></button>{error && <span className="mix-favorite-error" role="alert">{error}</span>}</div>;
}
