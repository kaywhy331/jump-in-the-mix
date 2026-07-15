export const CONTACT_PLACEHOLDERS = [
  "{{First Name}}",
  "{{Last Name}}",
  "{{Company}}",
  "{{Email}}",
  "{{Phone}}",
  "{{Address}}",
  "{{Public Notes}}",
  "{{contact.first_name}}",
  "{{contact.last_name}}",
  "{{contact.company}}",
  "{{contact.email}}",
  "{{contact.phone}}",
  "{{contact.address}}",
  "{{contact.public_notes}}"
] as const;

export const PRIVATE_NOTE_PLACEHOLDERS = [
  "{{Private Notes}}",
  "{{contact.private_notes}}"
] as const;

export const MY_INFO_PLACEHOLDERS = [
  "{{My First Name}}",
  "{{My Last Name}}",
  "{{My Email}}",
  "{{My Phone}}",
  "{{My Company}}",
  "{{My Website}}",
  "{{My Address}}",
  "{{My Product 1}}",
  "{{My Product 2}}",
  "{{My Product 3}}",
  "{{My Product 4}}",
  "{{My Product 5}}",
  "{{My Industry}}",
  "{{My Custom 1}}",
  "{{My Custom 2}}",
  "{{My Custom 3}}",
  "{{SMS Signature}}",
  "{{Email Signature}}",
  "{{my.first_name}}",
  "{{my.last_name}}",
  "{{my.email}}",
  "{{my.phone}}",
  "{{my.company}}",
  "{{my.website}}",
  "{{my.address}}",
  "{{my.product_1}}",
  "{{my.product_2}}",
  "{{my.product_3}}",
  "{{my.product_4}}",
  "{{my.product_5}}",
  "{{my.industry}}",
  "{{my.custom_1}}",
  "{{my.custom_2}}",
  "{{my.custom_3}}",
  "{{my.sms_signature}}",
  "{{my.email_signature}}"
] as const;

export const APPROVED_PLACEHOLDERS = [
  ...CONTACT_PLACEHOLDERS,
  ...PRIVATE_NOTE_PLACEHOLDERS,
  ...MY_INFO_PLACEHOLDERS
] as const;

export function findUnknownPlaceholders(value: string): string[] {
  const matches = value.match(/{{[^}]+}}/g) ?? [];
  const approved = new Set<string>(APPROVED_PLACEHOLDERS);
  return [...new Set(matches.filter((item) => !approved.has(item)))];
}

export function containsPrivateNotesPlaceholder(value: string): boolean {
  return PRIVATE_NOTE_PLACEHOLDERS.some((placeholder) => value.includes(placeholder));
}
