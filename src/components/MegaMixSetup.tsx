"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { TimezonePicker } from "@/components/TimezonePicker";
import { MegaMixPreview } from "@/components/MegaMixPreview";
import { MEGA_MIXES, megaMixById } from "@/lib/mega-mixes";
import { installMegaMixAction } from "@/lib/mega-mix-actions";

export function MegaMixSetup({ initialId, onboarding, active = true }: { initialId: string; active?: boolean; onboarding?: { userName: string; timezone: string } }) {
  const [selected, setSelected] = useState(initialId);
  const blueprint = megaMixById(selected) ?? MEGA_MIXES[0];
  return <div className="form-stack">
    {onboarding && <><label className="field"><span>Your mega-mix</span><select aria-label="Your mega-mix" value={blueprint.id} onChange={event => setSelected(event.target.value)}>{MEGA_MIXES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p>{blueprint.description} Includes {blueprint.nodes.length} connected mixes.</p><details className="onboarding-step-card"><summary>Preview the {blueprint.name} journey</summary><MegaMixPreview blueprint={blueprint} /></details></>}
    <ActionForm action={installMegaMixAction} protect={active}>
      <input type="hidden" name="blueprintId" value={blueprint.id} /><input type="hidden" name="version" value={blueprint.version} />
      {onboarding && <><input type="hidden" name="onboarding" value="1" /><label className="field"><span>Business name (optional)</span><input name="company" autoComplete="organization" maxLength={200} /></label><label className="field"><span>How do you sign texts?</span><input name="smsSignature" defaultValue={onboarding.userName} maxLength={160} required /></label><label className="field"><span>Your timezone</span><TimezonePicker id="mega-mix-timezone" defaultValue={onboarding.timezone} /></label></>}
      <p>Adds {blueprint.nodes.length} active mixes and their connections. Choose who starts and where they enter after setup. Adding the mega-mix enrolls nobody and sends nothing.</p>
      <label className="checkbox-card"><input key={blueprint.id} type="checkbox" name="reviewed" required /><span>I’ve reviewed the mixes, timing and connections.</span></label>
      <FormSubmitButton label={`Add ${blueprint.name} mega-mix`} pendingLabel="Connecting your mixes…" />
      <small>Your existing mixes and Journey paths stay in place. Each included Mix can be edited or paused afterward.</small>
    </ActionForm>
  </div>;
}
