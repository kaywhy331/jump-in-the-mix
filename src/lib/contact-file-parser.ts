import { cleanImportValue, MAX_FILE_BYTES, MAX_IMPORT_ROWS } from "@/lib/contact-import-shared";
import type { ParsedImportTable } from "@/lib/contact-import-types";
import type { DeviceContactInput } from "@/lib/device-contact";

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

type VcardValue = { value: string; label: string | null };
type VcardAddress = { street: string; extended: string; poBox: string; city: string; state: string; postalCode: string; country: string; label: string | null };
type VcardCard = {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  notes: string | null;
  birthday: string | null;
  anniversary: string | null;
  emails: VcardValue[];
  phones: VcardValue[];
  addresses: VcardAddress[];
};

function vcardBlocks(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, "").match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [];
}

function readVcard(card: string): VcardCard {
  const result: VcardCard = { displayName: null, firstName: null, lastName: null, company: null, notes: null, birthday: null, anniversary: null, emails: [], phones: [], addresses: [] };
  for (const rawLine of card.split(/\r?\n/)) {
    const separator = rawLine.indexOf(":");
    if (separator < 0) continue;
    const meta = rawLine.slice(0, separator);
    const rawValue = rawLine.slice(separator + 1);
    const parts = meta.split(";");
    const property = (parts.shift() ?? "").split(".").pop()?.toUpperCase() ?? "";
    const value = decodeVcardValue(rawValue, parts.some((part) => /^ENCODING=QUOTED-PRINTABLE$/i.test(part)));
    const label = vcardType(parts);

    if (property === "FN") result.displayName = value;
    else if (property === "N") {
      const [lastName, firstName] = value.split(";");
      if (firstName) result.firstName = firstName;
      if (lastName) result.lastName = lastName;
    } else if (property === "ORG") result.company = value.split(";")[0]?.trim() ?? value;
    else if (property === "EMAIL" && value) result.emails.push({ value, label });
    else if (property === "TEL" && value) result.phones.push({ value: value.replace(/^tel:/i, ""), label });
    else if (property === "ADR" && value) {
      const [poBox = "", extended = "", street = "", city = "", state = "", postalCode = "", country = ""] = value.split(";");
      if ([street, extended, poBox, city, state, postalCode, country].some(Boolean)) result.addresses.push({ street, extended, poBox, city, state, postalCode, country, label });
    } else if (property === "NOTE") result.notes = value;
    else if (property === "BDAY") result.birthday = value;
    else if (property === "ANNIVERSARY") result.anniversary = value;
  }
  return result;
}

export function parseVcfText(text: string, fileName = "contacts.vcf"): ParsedImportTable {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) throw new Error("Choose a VCF smaller than 10 MB.");
  const cards = vcardBlocks(text);
  if (!cards.length) throw new Error("No valid vCard records were found.");
  if (cards.length > MAX_IMPORT_ROWS) throw new Error(`Import up to ${MAX_IMPORT_ROWS.toLocaleString()} Contacts at a time.`);

  const canonicalRows: Record<string, string>[] = [];
  const warnings: string[] = [];
  for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
    const card = readVcard(cards[cardIndex]);
    const row: Record<string, string> = {};
    if (card.displayName !== null) row["Display Name"] = card.displayName;
    if (card.firstName) row["First Name"] = card.firstName;
    if (card.lastName) row["Last Name"] = card.lastName;
    if (card.company !== null) row.Company = card.company;
    if (card.notes !== null) row.Notes = card.notes;
    if (card.birthday !== null) row.Birthday = card.birthday;
    if (card.anniversary !== null) row.Anniversary = card.anniversary;

    card.emails.forEach((item, index) => {
      row[`Email ${index + 1}`] = item.value;
      if (item.label) row[`Email ${index + 1} Label`] = item.label;
    });
    card.phones.forEach((item, index) => {
      row[`Phone ${index + 1}`] = item.value;
      if (item.label) row[`Phone ${index + 1} Label`] = item.label;
    });
    card.addresses.forEach((item, index) => {
      row[`Address ${index + 1}`] = [item.street, item.extended, item.poBox, item.city, item.state, item.postalCode, item.country].filter(Boolean).join(", ");
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

/**
 * Contact cards shared from a phone, in the shape the device contact picker sends: name, company,
 * emails, phones and addresses. Notes, dates and photos are left out, because nothing reviews them
 * before they are saved. Cards without a name, company, email or phone are dropped.
 */
export function parseVcardDeviceContacts(text: string): DeviceContactInput[] {
  return vcardBlocks(text).map(readVcard).map((card) => ({
    names: [card.displayName || [card.firstName, card.lastName].filter(Boolean).join(" ")].filter(Boolean),
    company: card.company || null,
    structuredName: { firstName: card.firstName, lastName: card.lastName },
    emails: card.emails.map((item) => item.value),
    phones: card.phones.map((item) => item.value),
    addresses: card.addresses.map((item) => ({
      // An iPhone writes a two-line street as one value with a line break.
      addressLines: [...item.street.split("\n"), item.extended, item.poBox].map((line) => line.trim()).filter(Boolean),
      city: item.city || null,
      region: item.state || null,
      postalCode: item.postalCode || null,
      country: item.country || null
    }))
  })).filter((contact) => [...contact.names, contact.company ?? "", ...contact.emails, ...contact.phones].some((value) => value.trim()));
}

export function parseContactFile(text: string, fileName: string): ParsedImportTable {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".vcf") || lowerName.endsWith(".vcard") || /BEGIN:VCARD/i.test(text)) return parseVcfText(text, fileName);
  return parseCsvText(text, fileName);
}
