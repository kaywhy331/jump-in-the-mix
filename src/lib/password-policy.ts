export function passwordValidationError(password: string): string | null {
  if (password.length < 12) return "Use a password with at least 12 characters.";
  if (Buffer.byteLength(password, "utf8") > 72) return "Use a password shorter than 72 bytes.";
  return null;
}
