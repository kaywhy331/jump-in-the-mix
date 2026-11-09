import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SendingSettingsContent } from "../../src/components/SendingSettingsContent";
import "../../src/styles/index.css";

// Real presentation and preview components; capability inputs and saves are isolated from providers.
const params = new URL(location.href).searchParams;
document.documentElement.dataset.theme = params.get("theme") ?? "light";
function Fixture() {
  const [saved, setSaved] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <main><div className="page page--form sending-settings-page" data-ready={ready}>
    <h1>Sending to customers</h1>
    <SendingSettingsContent
      automation={{ enabled: params.get("on") === "1", emailEnabled: params.get("emailSaved") === "1", smsEnabled: params.get("smsSaved") === "1", reviewWindowMinutes: Number(params.get("minutes") ?? 30) }}
      emailAvailable={params.get("email") === "1"} smsAvailable={params.get("sms") === "1"}
      locale="en-US" viewOnly={params.get("viewOnly") === "1"}
      saveAction={async (_previous, data) => { setSaved(JSON.stringify(Object.fromEntries(data))); return {}; }}
      consent={<label className="checkbox-card automation-consent"><input type="checkbox" name="automationConsent" /><span><strong>I understand these messages send without a final tap</strong><small>I have reviewed my active Mixes, signatures, recipients, and consent obligations.</small></span></label>}
    />
    <output data-saved>{saved}</output>
  </div></main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
