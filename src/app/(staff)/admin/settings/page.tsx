import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { resetPlatformSettingAction, savePlatformSettingAction } from "@/lib/admin-settings-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { getPlatformSettingsSnapshot } from "@/lib/platform-settings";

export const metadata: Metadata = { title: "Admin · System Settings" };

function listText(value: unknown): string {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";
}

export default async function AdminSystemSettingsPage() {
  const { user } = await requirePlatformAdmin("settings.manage");
  const displayPreferences = await displayPreferencesForUser(user.id);
  const settings = await getPlatformSettingsSnapshot();
  const categories = [...new Set(settings.map((setting) => setting.category))];

  return (
    <div className="page admin-control-page">
      <header className="page-header">
        <div><h1>Admin · System Settings</h1><p>Manage reviewed mix-library options without editing application code.</p></div>
      </header>

      <section className="card admin-safety-card">
        <strong>Validated configuration</strong>
        <p>Empty lists, duplicate options, and unknown keys are rejected. Reset restores the reviewed application fallback without changing customer records.</p>
      </section>

      <div className="admin-setting-groups">
        {categories.map((category) => (
          <section className="admin-setting-group" key={category}>
            <div className="section-label"><h2>{category}</h2><span>{settings.filter((setting) => setting.category === category).length} settings</span></div>
            <div className="admin-setting-grid">
              {settings.filter((setting) => setting.category === category).map((setting) => (
                <article className="card admin-setting-card" key={setting.key}>
                  <div className="admin-setting-heading">
                    <div><h3>{setting.label}</h3><p>{setting.description}</p></div>
                    <span className={setting.isCustomized ? "status-pill done" : "status-pill"}>{setting.isCustomized ? "Customized" : "Default"}</span>
                  </div>
                  <code>{setting.key}</code>
                  <form action={savePlatformSettingAction} className="form-stack">
                    <input type="hidden" name="key" value={setting.key} />
                    <div className="field">
                      <label htmlFor={`setting-${setting.key}`}>Options, one per line</label>
                      <textarea id={`setting-${setting.key}`} name="options" defaultValue={listText(setting.value)} rows={Math.min(Math.max(Array.isArray(setting.value) ? setting.value.length : 5, 5), 12)} required />
                      <small>Order is preserved. Duplicate values are removed case-insensitively.</small>
                    </div>
                    <button className="button primary" type="submit">Save setting</button>
                  </form>
                  {setting.isCustomized && (
                    <form action={resetPlatformSettingAction}>
                      <input type="hidden" name="key" value={setting.key} />
                      <button className="button small" type="submit">Reset to reviewed default</button>
                    </form>
                  )}
                  {setting.updatedAt && <small>Last changed {formatDateTime(setting.updatedAt, displayPreferences)}</small>}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
