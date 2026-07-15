import type { Channel, WorkspaceProfile } from "@/generated/prisma/client";

export type JumpRenderContact = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  publicNotes: string | null;
  privateNotes: string | null;
  emails: { email: string; isPrimary: boolean }[];
  phones: { phone: string; isPrimary: boolean }[];
  addresses: {
    street1: string | null;
    street2?: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country?: string | null;
    isPrimary: boolean;
  }[];
};

export type JumpRenderOwner = { name: string; email: string };

export type JumpTemplateContent = {
  subject?: string | null;
  body?: string | null;
  script?: string | null;
};

export type JumpRenderedSnapshot = {
  subject: string | null;
  body: string | null;
  script: string | null;
};

function ownerNameParts(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

export function primaryContactEmail(contact: Pick<JumpRenderContact, "emails">): string {
  return contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email ?? "";
}

export function primaryContactPhone(contact: Pick<JumpRenderContact, "phones">): string {
  return contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone ?? "";
}

export function formatContactAddress(contact: Pick<JumpRenderContact, "addresses">): string {
  const address = contact.addresses.find((item) => item.isPrimary) ?? contact.addresses[0];
  return address
    ? [address.street1, address.street2, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ")
    : "";
}

export function buildJumpReplacementValues(
  contact: JumpRenderContact,
  profile: WorkspaceProfile | null,
  owner: JumpRenderOwner,
  channel: Channel
): Record<string, string> {
  const email = primaryContactEmail(contact);
  const phone = primaryContactPhone(contact);
  const address = formatContactAddress(contact);
  const ownerName = ownerNameParts(owner.name);
  const privateNotes = channel === "PHONE_CALL" ? contact.privateNotes ?? "" : "";
  const myAddress = profile?.mailingAddress ?? [profile?.street, profile?.city, profile?.state, profile?.postalCode].filter(Boolean).join(", ");

  return {
    "{{First Name}}": contact.firstName ?? "there",
    "{{Last Name}}": contact.lastName ?? "",
    "{{Company}}": contact.company ?? "",
    "{{Email}}": email,
    "{{Phone}}": phone,
    "{{Address}}": address,
    "{{Public Notes}}": contact.publicNotes ?? "",
    "{{Private Notes}}": privateNotes,
    "{{contact.first_name}}": contact.firstName ?? "there",
    "{{contact.last_name}}": contact.lastName ?? "",
    "{{contact.company}}": contact.company ?? "",
    "{{contact.email}}": email,
    "{{contact.phone}}": phone,
    "{{contact.address}}": address,
    "{{contact.public_notes}}": contact.publicNotes ?? "",
    "{{contact.private_notes}}": privateNotes,
    "{{My First Name}}": ownerName.firstName,
    "{{My Last Name}}": ownerName.lastName,
    "{{My Email}}": owner.email,
    "{{My Phone}}": profile?.phone ?? "",
    "{{My Company}}": profile?.company ?? "",
    "{{My Website}}": profile?.website ?? "",
    "{{My Address}}": myAddress,
    "{{My Product 1}}": profile?.product1 ?? "",
    "{{My Product 2}}": profile?.product2 ?? "",
    "{{My Product 3}}": profile?.product3 ?? "",
    "{{My Product 4}}": profile?.product4 ?? "",
    "{{My Product 5}}": profile?.product5 ?? "",
    "{{My Industry}}": profile?.industry ?? "",
    "{{My Custom 1}}": profile?.myCustom1 ?? "",
    "{{My Custom 2}}": profile?.myCustom2 ?? "",
    "{{My Custom 3}}": profile?.myCustom3 ?? "",
    "{{SMS Signature}}": profile?.smsSignature ?? "",
    "{{Email Signature}}": profile?.emailSignature ?? "",
    "{{my.first_name}}": ownerName.firstName,
    "{{my.last_name}}": ownerName.lastName,
    "{{my.email}}": owner.email,
    "{{my.phone}}": profile?.phone ?? "",
    "{{my.company}}": profile?.company ?? "",
    "{{my.website}}": profile?.website ?? "",
    "{{my.address}}": myAddress,
    "{{my.product_1}}": profile?.product1 ?? "",
    "{{my.product_2}}": profile?.product2 ?? "",
    "{{my.product_3}}": profile?.product3 ?? "",
    "{{my.product_4}}": profile?.product4 ?? "",
    "{{my.product_5}}": profile?.product5 ?? "",
    "{{my.industry}}": profile?.industry ?? "",
    "{{my.custom_1}}": profile?.myCustom1 ?? "",
    "{{my.custom_2}}": profile?.myCustom2 ?? "",
    "{{my.custom_3}}": profile?.myCustom3 ?? "",
    "{{my.sms_signature}}": profile?.smsSignature ?? "",
    "{{my.email_signature}}": profile?.emailSignature ?? ""
  };
}

export function renderJumpTemplate(template: string | null | undefined, values: Record<string, string>): string | null {
  if (!template) return null;
  return template.replace(/{{[^}]+}}/g, (token) => values[token] ?? "");
}

export function renderJumpSnapshot(
  template: JumpTemplateContent,
  contact: JumpRenderContact,
  profile: WorkspaceProfile | null,
  owner: JumpRenderOwner,
  channel: Channel
): JumpRenderedSnapshot {
  const values = buildJumpReplacementValues(contact, profile, owner, channel);
  return {
    subject: renderJumpTemplate(template.subject, values),
    body: renderJumpTemplate(template.body, values),
    script: renderJumpTemplate(template.script, values)
  };
}
