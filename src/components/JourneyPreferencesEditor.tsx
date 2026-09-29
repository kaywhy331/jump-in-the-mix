"use client";
import { useId, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { JourneyPreferenceFields } from "@/components/JourneyPreferenceFields";
import { saveJourneyPreferencesAction } from "@/lib/mega-mix-actions";
import type { JourneySetupValues } from "@/lib/journey-preferences";

export function JourneyPreferencesEditor({ initial }: { initial: JourneySetupValues }) {
  const [value, setValue] = useState(initial), id = useId();
  return <ActionForm action={saveJourneyPreferencesAction} protect>
    <p>Working hours apply to flexible follow-ups throughout your account. Communication and spacing choices apply when adding a new Mega-Mix; your existing wording and delays stay as you set them.</p>
    <JourneyPreferenceFields id={id} value={value} onChange={setValue} />
    <FormSubmitButton label="Save journey preferences" pendingLabel="Saving…" />
  </ActionForm>;
}
