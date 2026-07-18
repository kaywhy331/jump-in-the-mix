import { cleanImportValue, MAX_FILE_BYTES, MAX_IMPORT_ROWS } from "@/lib/contact-import-shared";
import type { ParsedImportTable } from "@/lib/contact-import-types";

function uniqueHeaders(values: string[]): string[] {
  const used = new Map<string, number>();
  return values.map((raw, index) => {
    const base = cleanImportValue(raw) || `Column ${index + 1}`;
    const count = (used.get(base.toLowerCase()) ?? 0) + 1;
    used.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && character === delimiter) count += 1;
  }
  return count;
}

export function detectCsvDelimiter(text: string): string {
  const sample = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).slice(0, 5).join("\n");
  return [",", "\t", ";"]
    .map((delimiter) => ({ delimiter, count: countDelimiter(sample, delimiter) }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ",";
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (inQuotes && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && character === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    field += character;
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  if (inQuotes) throw new Error("The CSV contains an unclosed quoted value.");
  return rows;
}

export function parseCsvText(text: string, fileName = "contacts.csv"): ParsedImportTable {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) throw new Error("Choose a CSV smaller than 10 MB.");
  const rows = parseDelimitedRows(text, detectCsvDelimiter(text));
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one Contact row.");
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new Error(`Import up to ${MAX_IMPORT_ROWS.toLocaleString()} Contacts at a time.`);

  const widest = Math.max(...rows.map((row) => row.length));
  const headers = uniqueHeaders(Array.from({ length: widest }, (_, index) => rows[0]?.[index] ?? ""));
  const mappedRows = rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, cleanImportValue(values[index])])));
  return { source: "CSV", fileName, headers, rows: mappedRows, rowNumbers: mappedRows.map((_, index) => index + 2), warnings: [] };
}

function decodeQuotedPrintable(value: string): string {
  return value.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function decodeVcardValue(value: string, quotedPrintable: boolean): string {
  const decoded = quotedPrintable ? decodeQuotedPrintable(value) : value;
  return decoded.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function vcardType(metaParts: string[]): string | null {
  const values = metaParts.flatMap((part) => part.split(",")).map((part) => part.trim()).filter(Boolean);
  const explicit = values.find((part) => /^TYPE=/i.test(part));
  if (explicit) return explicit.replace(/^TYPE=/i, "").split(",")[0]?.trim() || null;
  return values.find((part) => !part.includes("=") && !/^(PREF|VOICE)$/i.test(part)) ?? null;
}

export function parseVcfText(text: string, fileName = "contacts.vcf"): ParsedImportTable {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) throw new Error("Choose a VCF smaller than 10 MB.");
  const cards = text.replace(/\r?\n[ \t]/g, "").match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [];
  if (!cards.length) throw new Error("No valid vCard records were found.");
  if (cards.length > MAX_IMPORT_ROWS) throw new Error(`Import up to ${MAX_IMPORT_ROWS.toLocaleString()} Contacts at a time.`);

  const canonicalRows: Record<string, string>[] = [];
  const warnings: string[] = [];
  for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
    const row: Record<string, string> = {};
    const emails: { value: string; label: string | null }[] = [];
    const phones: { value: string; label: string | null }[] = [];
    const addresses: { value: string; label: string | null }[] = [];

    for (const rawLine of cards[cardIndex].split(/\r?\n/)) {
      const separator = rawLine.indexOf(":");
      if (separator < 0) continue;
      const meta = rawLine.slice(0, separator);
      const rawValue = rawLine.slice(separator + 1);
      const parts = meta.split(";");
      const property = (parts.shift() ?? "").split(".").pop()?.toUpperCase() ?? "";
      const value = decodeVcardValue(rawValue, parts.some((part) => /^ENCODING=QUOTED-PRINTABLE$/i.test(part)));
      const label = vcardType(parts);

      if (property === "FN") row["Display Name"] = value;
      else if (property === "N") {
        const [lastName, firstName] = value.split(";");
        if (firstName) row["First Name"] = firstName;
        if (lastName) row["Last Name"] = lastName;
      } else if (property === "ORG") row.Company = value.split(";")[0]?.trim() ?? value;
      else if (property === "EMAIL" && value) emails.push({ value, label });
      else if (property === "TEL" && value) phones.push({ value: value.replace(/^tel:/i, ""), label });
      else if (property === "ADR" && value) {
        const [poBox, extended, street, city, state, postalCode, country] = value.split(";");
        const formatted = [street, extended, poBox, city, state, postalCode, country].filter(Boolean).join(", ");
        if (formatted) addresses.push({ value: formatted, label });
      } else if (property === "NOTE") row.Notes = value;
      else if (property === "BDAY") row.Birthday = value;
      else if (property === "ANNIVERSARY") row.Anniversary = value;
    }

    emails.forEach((item, index) => {
      row[`Email ${index + 1}`] = item.value;
      if (item.label) row[`Email ${index + 1} Label`] = item.label;
    });
    phones.forEach((item, index) => {
      row[`Phone ${index + 1}`] = item.value;
      if (item.label) row[`Phone ${index + 1} Label`] = item.label;
    });
    addresses.forEach((item, index) => {
      row[`Address ${index + 1}`] = item.value;
      if (item.label) row[`Address ${index + 1} Label`] = item.label;
    });
    if (!Object.values(row).some(Boolean)) warnings.push(`vCard ${cardIndex + 1} did not contain importable Contact fields.`);
    else canonicalRows.push(row);
  }

  const preferredOrder = ["First Name", "Last Name", "Display Name", "Company", "Email 1", "Phone 1", "Address 1", "Birthday", "Anniversary", "Notes"];
  const discovered = [...new Set(canonicalRows.flatMap((row) => Object.keys(row)))];
  const headers = [...preferredOrder.filter((header) => discovered.includes(header)), ...discovered.filter((header) => !preferredOrder.includes(header))];
  return {
    source: "VCF",
    fileName,
    headers,
    rows: canonicalRows.map((row) => Object.fromEntries(headers.map((header) => [header, row[header] ?? ""]))),
    rowNumbers: canonicalRows.map((_, index) => index + 1),
    warnings
  };
}

export function parseContactFile(text: string, fileName: string): ParsedImportTable {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".vcf") || lowerName.endsWith(".vcard") || /BEGIN:VCARD/i.test(text)) return parseVcfText(text, fileName);
  return parseCsvText(text, fileName);
}
