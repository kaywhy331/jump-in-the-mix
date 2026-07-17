import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Device Contact Picker and Quick Add boundaries", () => {
  it("uses progressive capability detection with an explicit manual fallback", () => {
    const component = read("src/components/DeviceContactQuickAdd.tsx");
    expect(component).toContain("navigator");
    expect(component).toContain("contacts?: ContactsManager");
    expect(component).toContain("window.isSecureContext");
    expect(component).toContain("manager.select(properties, { multiple: true })");
    expect(component).toContain("/contacts/new?quickAddFallback=1");
    expect(component).not.toContain('"photo"');
  });

  it("keeps tenant identity and plan enforcement on the server", () => {
    const route = read("src/app/api/contacts/quick-add/route.ts");
    const service = read("src/lib/contact-quick-add.ts");
    expect(route).toContain("getCurrentSession(");
    expect(route).toContain("session.impersonation");
    expect(route).toContain('scope: "api.contact-quick-add"');
    expect(route).toContain("consumeRateLimit(");
    expect(route).toContain("status: 409");
    const schemaBlock = route.slice(route.indexOf("const requestSchema"), route.indexOf("export async function POST"));
    expect(schemaBlock).not.toContain("workspaceId");
    expect(schemaBlock).not.toContain("actorUserId");
    expect(service).toContain("findImportMatches(");
    expect(service).toContain("commitContactImportBatch(");
    expect(service).toContain("QuickAddPlanLimitError");
    expect(service).toContain('action: "contact.quick-add"');
  });

  it("wires Quick Add into Contacts and limits voice dictation to Public Notes", () => {
    const contacts = read("src/components/ContactsBulkWorkspace.tsx");
    const form = read("src/components/ContactForm.tsx");
    expect(contacts).toContain("DeviceContactQuickAdd");
    expect(form).toContain('mode === "create" && <VoiceNoteButton targetId="publicNotes" />');
    expect(form).not.toContain('VoiceNoteButton targetId="privateNotes"');
  });
});
