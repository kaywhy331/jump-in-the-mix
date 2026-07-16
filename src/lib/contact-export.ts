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
};

function addressText(address: ExportContact["addresses"][number] | undefined): string {
  return address
    ? [address.street1, address.street2, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ")
    : "";
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function createContactsCsv(contacts: ExportContact[]): string {
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
    "Public Notes"
  ];

  const rows = contacts.map((contact) => {
    const primaryEmail = contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email ?? "";
    const primaryPhone = contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone ?? "";
    const primaryAddress = contact.addresses.find((item) => item.isPrimary) ?? contact.addresses[0];
    const jumpDates = contact.jumpDates.map((item) => [item.type, item.label, item.date, item.recurrence].filter(Boolean).join(" · ")).join(" | ");

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
      contact.publicNotes ?? ""
    ].map(csvCell).join(",");
  });

  return [header.map(csvCell).join(","), ...rows].join("\r\n");
}
