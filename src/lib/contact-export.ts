export type ExportContact = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  publicNotes: string | null;
  emails: { email: string; isPrimary: boolean }[];
  phones: { phone: string; isPrimary: boolean }[];
  addresses: {
    street1: string | null;
    street2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    isPrimary: boolean;
  }[];
  groups: string[];
  jumpDates: { type: string; label: string | null; date: string | null; recurrence: string }[];
  customFields?: { key: string; name: string; value: string }[];
};

function addressText(address: ExportContact["addresses"][number] | undefined): string {
  return address
    ? [address.street1, address.street2, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ")
    : "";
}

export function neutralizeSpreadsheetFormula(value: string): string {
  const withoutNulls = value.replaceAll("\u0000", "");
  const firstVisible = withoutNulls.replace(/^[\t\r\n ]+/, "");
  return /^[=+\-@]/.test(firstVisible) ? `'${withoutNulls}` : withoutNulls;
}

export function csvCell(value: string): string {
  return `"${neutralizeSpreadsheetFormula(value).replaceAll('"', '""')}"`;
}

export function createContactsCsv(contacts: ExportContact[]): string {
  const customFields = new Map<string, string>();
  for (const contact of contacts) {
    for (const field of contact.customFields ?? []) {
      if (!customFields.has(field.key)) customFields.set(field.key, field.name);
    }
  }
  const orderedCustomFields = [...customFields.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  const header = [
    "First Name",
    "Last Name",
    "Company",
    "Primary Email",
    "All Emails",
    "Primary Phone",
    "All Phones",
    "Primary Address",
    "All Addresses",
    "Groups",
    "Jump Dates",
    "Public Notes",
    ...orderedCustomFields.map(([, name]) => `Custom: ${name}`)
  ];

  const rows = contacts.map((contact) => {
    const primaryEmail = contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email ?? "";
    const primaryPhone = contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone ?? "";
    const primaryAddress = contact.addresses.find((item) => item.isPrimary) ?? contact.addresses[0];
    const jumpDates = contact.jumpDates.map((item) => [item.type, item.label, item.date, item.recurrence].filter(Boolean).join(" · ")).join(" | ");
    const customByKey = new Map((contact.customFields ?? []).map((field) => [field.key, field.value]));

    return [
      contact.firstName ?? "",
      contact.lastName ?? "",
      contact.company ?? "",
      primaryEmail,
      contact.emails.map((item) => item.email).join(" | "),
      primaryPhone,
      contact.phones.map((item) => item.phone).join(" | "),
      addressText(primaryAddress),
      contact.addresses.map(addressText).filter(Boolean).join(" | "),
      contact.groups.join(" | "),
      jumpDates,
      contact.publicNotes ?? "",
      ...orderedCustomFields.map(([key]) => customByKey.get(key) ?? "")
    ].map(csvCell).join(",");
  });

  return [header.map(csvCell).join(","), ...rows].join("\r\n");
}

function createCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((row) => row.map((value) => csvCell(value)).join(",")).join("\r\n");
}

export type ExportTimelineActivity = {
  contactId: string;
  occurredAt: Date;
  kind: string;
  outcome: string | null;
  channel: string | null;
  visibility: string;
  summary: string | null;
  nextCommitmentAt: Date | null;
};

export function createTimelineCsv(activities: ExportTimelineActivity[], contactNames: Map<string, string>): string {
  return createCsv(
    ["Date", "Contact", "Activity", "Outcome", "Channel", "Note privacy", "Summary", "Next follow-up"],
    activities.map((activity) => [
      activity.occurredAt.toISOString(),
      contactNames.get(activity.contactId) ?? "Unknown contact",
      activity.kind,
      activity.outcome ?? "",
      activity.channel ?? "",
      activity.visibility === "PRIVATE" ? "Private" : "Customer timeline",
      activity.summary ?? "",
      activity.nextCommitmentAt?.toISOString() ?? ""
    ])
  );
}

export type ExportFollowUp = {
  scheduledAt: Date;
  completedAt: Date | null;
  status: string;
  reason: string;
  contact: { displayName: string };
  mix: { name: string };
  stepVersion: { stepTemplate: { channel: string } };
  renderedSnapshot: unknown;
};

export function createFollowUpsCsv(followUps: ExportFollowUp[]): string {
  return createCsv(
    ["Scheduled", "Contact", "Plan", "Status", "Channel", "Reason", "Subject", "Prepared message", "Completed"],
    followUps.map((followUp) => {
      const rendered = followUp.renderedSnapshot && typeof followUp.renderedSnapshot === "object"
        ? followUp.renderedSnapshot as { subject?: unknown; body?: unknown; script?: unknown }
        : {};
      return [
        followUp.scheduledAt.toISOString(),
        followUp.contact.displayName,
        followUp.mix.name,
        followUp.status,
        followUp.stepVersion.stepTemplate.channel,
        followUp.reason,
        typeof rendered.subject === "string" ? rendered.subject : "",
        typeof rendered.body === "string" ? rendered.body : typeof rendered.script === "string" ? rendered.script : "",
        followUp.completedAt?.toISOString() ?? ""
      ];
    })
  );
}
