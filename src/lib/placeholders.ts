export const APPROVED_PLACEHOLDERS = [
  "{{First Name}}",
  "{{Last Name}}",
  "{{Company}}",
  "{{Email}}",
  "{{Phone}}",
  "{{Address}}",
  "{{My Company}}",
  "{{My Website}}",
  "{{My Product 1}}",
  "{{My Product 2}}",
  "{{My Product 3}}",
  "{{My Product 4}}",
  "{{My Product 5}}",
  "{{My Industry}}",
  "{{SMS Signature}}",
  "{{Email Signature}}"
] as const;

export function findUnknownPlaceholders(value: string): string[] {
  const matches = value.match(/{{[^}]+}}/g) ?? [];
  const approved = new Set<string>(APPROVED_PLACEHOLDERS);
  return [...new Set(matches.filter((item) => !approved.has(item)))];
}
