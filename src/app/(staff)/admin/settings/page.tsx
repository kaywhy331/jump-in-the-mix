import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { LibraryOptionsForm } from "@/components/LibraryOptionsForm";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { getPlatformSettingsSnapshot } from "@/lib/platform-settings";

export const metadata: Metadata = { title: "Admin · Library options" };

function listOptions(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }

export default async function AdminSystemSettingsPage() {
  const { user } = await requirePlatformAdmin("settings.manage");
  const displayPreferences = await displayPreferencesForUser(user.id);
  const settings = await getPlatformSettingsSnapshot();
  const categories = [...new Set(settings.map((setting) => setting.category))];

  return (
    <div className="page admin-control-page">
      <header className="page-header">
        <div><h1>Admin · Library options</h1><p>Manage reviewed mix-library options without editing application code.</p></div>
      </header>

      <section className="card admin-safety-card">
        <strong>Validated configuration</strong>
        <p>Choose and reorder reviewed values. Saving changes the customer library filters and customer mix editors. It does not rename existing content.</p>
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
                  <LibraryOptionsForm revision={setting.updatedAt?.toISOString() ?? "default"} settingKey={setting.key} options={listOptions(setting.value)} allowed={[...setting.defaultValue]} />
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
