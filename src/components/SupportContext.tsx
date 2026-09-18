"use client";
import { useState } from "react";
const sections = ["Today", "Contacts", "Mixes", "Calendar", "Journey", "Settings", "Account", "Help"];
export function SupportContext() {
  const [enabled, setEnabled] = useState(false); const [section, setSection] = useState("Help");
  return <div><label className="checkbox-row"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Include the affected section and this device’s screen layout</label>{enabled && <><label className="field"><span>Affected section</span><select value={section} onChange={event => setSection(event.target.value)}>{sections.map(value => <option key={value}>{value}</option>)}</select></label><input name="supportContext" type="hidden" value={`${section}; ${typeof window !== "undefined" && window.innerWidth < 768 ? "phone" : "desktop/tablet"} layout`} /><small>Includes only this section name and layout. No contact IDs, page contents, cookies, or browsing history.</small></>}</div>;
}
