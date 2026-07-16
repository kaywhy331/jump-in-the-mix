export const MAX_IMPORT_ROWS = 5000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function cleanImportValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizedImportText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function stableKey(value: string): string {
  return normalizedImportText(value).replace(/\s+/g, "-").slice(0, 48);
}

export function stableImportHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function escapeImportCsv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
