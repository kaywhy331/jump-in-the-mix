import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/contact-input";
import { cleanImportValue, normalizedImportText, stableImportHash, stableKey } from "@/lib/contact-import-shared";
import type {
  ImportAddress,
  ImportColumnMapping,
  ImportCustomFieldOption,
  ImportDateTypeOption,
  ImportField,
  ImportJumpDate,
  ImportMappingTarget,
  ImportRecurrence,
  ParsedImportTable,
  PreparedImportRow
} from "@/lib/contact-import-types";

export function encodeMappingTarget(target: ImportMappingTarget): string {
  if (target.kind === "IGNORE") return "ignore";
  if (target.kind === "FIELD") return `field:${target.field}`;
  if (target.kind === "CUSTOM") return `custom:${target.definitionId}`;
  if (target.dateTypeId) return `date-id:${target.dateTypeId}:${target.recurrence}`;
  return `date-new:${encodeURIComponent(target.dateTypeName ?? "Imported Date")}:${target.recurrence}`;
}

export function decodeMappingTarget(value: string): ImportMappingTarget {
  if (!value || value === "ignore") return { kind: "IGNORE" };
  const [kind, identifier, recurrence] = value.split(":");
  if (kind === "field") return { kind: "FIELD", field: identifier as ImportField };
  if (kind === "custom") return { kind: "CUSTOM", definitionId: identifier };
  if (kind === "date-id") return { kind: "DATE", dateTypeId: identifier, dateTypeName: null, recurrence: recurrence as ImportRecurrence };
  if (kind === "date-new") {
    return { kind: "DATE", dateTypeId: null, dateTypeName: decodeURIComponent(identifier || "Imported Date"), recurrence: recurrence as ImportRecurrence };
  }
  return { kind: "IGNORE" };
}

function dateHeaderName(header: string): string {
  return header
    .replace(/[_-]+/g, " ")
    .replace(/\b(date|dt)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || "Imported Date";
}

export function guessImportMappings(
  headers: string[],
  dateTypes: ImportDateTypeOption[],
  customFields: ImportCustomFieldOption[]
): ImportColumnMapping {
  const result: ImportColumnMapping = {};
  const dateTypeBySlug = new Map(dateTypes.map((type) => [stableKey(type.slug || type.name), type]));
  const customByKey = new Map(customFields.flatMap((field) => [[stableKey(field.key), field], [stableKey(field.name), field]]));

  for (const header of headers) {
    const normalized = normalizedImportText(header);
    const compact = normalized.replace(/\s+/g, "");
    let target: ImportMappingTarget = { kind: "IGNORE" };

    if (/^(first|given)(name)?$/.test(compact) || normalized === "given name") target = { kind: "FIELD", field: "firstName" };
    else if (/^(last|family|surname)(name)?$/.test(compact) || normalized === "family name") target = { kind: "FIELD", field: "lastName" };
    else if (["name", "full name", "display name", "contact name"].includes(normalized)) target = { kind: "FIELD", field: "displayName" };
    else if (/company|organization|organisation|employer/.test(normalized)) target = { kind: "FIELD", field: "company" };
    else if (/^e ?mail( address)?( \d+)?$/.test(normalized) && !/label|type/.test(normalized)) target = { kind: "FIELD", field: "email" };
    else if (/^(mobile|cell|phone|telephone|tel)( number)?( \d+)?$/.test(normalized) && !/label|type/.test(normalized)) target = { kind: "FIELD", field: "phone" };
    else if (/^address( \d+)?$/.test(normalized) || normalized === "mailing address") target = { kind: "FIELD", field: "address" };
    else if (/address 1|street 1|street address|address line 1/.test(normalized)) target = { kind: "FIELD", field: "street1" };
    else if (/address 2|street 2|address line 2|suite|unit/.test(normalized)) target = { kind: "FIELD", field: "street2" };
    else if (/^city$|locality/.test(normalized)) target = { kind: "FIELD", field: "city" };
    else if (/^state$|province|region/.test(normalized)) target = { kind: "FIELD", field: "state" };
    else if (/zip|postal/.test(normalized)) target = { kind: "FIELD", field: "postalCode" };
    else if (/^country$/.test(normalized)) target = { kind: "FIELD", field: "country" };
    else if (/note|comments|context/.test(normalized)) target = { kind: "FIELD", field: "publicNotes" };
    else {
      const customField = customByKey.get(stableKey(header));
      if (customField) target = { kind: "CUSTOM", definitionId: customField.id };
      else {
        const isBirthday = /birthday|birth date|bday|date of birth|dob/.test(normalized);
        const isAnniversary = /anniversary/.test(normalized);
        const isDateLike = isBirthday || isAnniversary || /date|renewal|closing|appointment|event|follow up|followup|contract/.test(normalized);
        if (isDateLike) {
          const desiredName = isBirthday ? "Birthday" : isAnniversary ? "Anniversary" : dateHeaderName(header);
          const existing = dateTypeBySlug.get(stableKey(desiredName));
          target = {
            kind: "DATE",
            dateTypeId: existing?.id ?? null,
            dateTypeName: existing ? null : desiredName,
            recurrence: isBirthday || isAnniversary ? "YEARLY" : "NONE"
          };
        }
      }
    }
    result[header] = encodeMappingTarget(target);
  }
  return result;
}

function splitMultiValue(value: string, type: "email" | "phone"): string[] {
  if (!value.trim()) return [];
  const separator = type === "email" ? /[|\n,]+/ : /[|\n]+/;
  return value.split(separator).map((part) => part.trim()).filter(Boolean);
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function parseImportDate(value: string): { dateValue: string | null; month: number | null; day: number | null } | null {
  const raw = value.trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return { dateValue: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, month, day };
  }

  match = raw.match(/^--(\d{2})-?(\d{2})$/) ?? raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (!isValidCalendarDate(2000, month, day)) return null;
    return { dateValue: null, month, day };
  }

  match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const shortYear = Number(match[3]);
    const year = match[3].length === 2 ? (shortYear >= 50 ? 1900 + shortYear : 2000 + shortYear) : shortYear;
    if (!isValidCalendarDate(year, month, day)) return null;
    return { dateValue: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, month, day };
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth() + 1;
    const day = parsed.getUTCDate();
    if (isValidCalendarDate(year, month, day)) {
      return { dateValue: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, month, day };
    }
  }
  return null;
}

function firstNonempty(values: string[]): string | null {
  return values.map(cleanImportValue).find(Boolean) ?? null;
}

export function buildImportRows(table: ParsedImportTable, mapping: ImportColumnMapping, groupIds: string[] = []): PreparedImportRow[] {
  return table.rows.map((raw, rowIndex) => {
    const firstNames: string[] = [];
    const lastNames: string[] = [];
    const displayNames: string[] = [];
    const companies: string[] = [];
    const notes: string[] = [];
    const emailValues: { value: string; label: string | null }[] = [];
    const phoneValues: { value: string; label: string | null }[] = [];
    const looseAddresses: { value: string; label: string | null }[] = [];
    const structured: Record<"street1" | "street2" | "city" | "state" | "postalCode" | "country", string[]> = {
      street1: [], street2: [], city: [], state: [], postalCode: [], country: []
    };
    const customFields = new Map<string, string>();
    const jumpDates: ImportJumpDate[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const header of table.headers) {
      const cell = cleanImportValue(raw[header]);
      if (!cell) continue;
      const target = decodeMappingTarget(mapping[header] ?? "ignore");
      if (target.kind === "FIELD") {
        if (target.field === "firstName") firstNames.push(cell);
        else if (target.field === "lastName") lastNames.push(cell);
        else if (target.field === "displayName") displayNames.push(cell);
        else if (target.field === "company") companies.push(cell);
        else if (target.field === "publicNotes") notes.push(cell);
        else if (target.field === "email") emailValues.push(...splitMultiValue(cell, "email").map((item) => ({ value: item, label: cleanImportValue(raw[`${header} Label`]) || null })));
        else if (target.field === "phone") phoneValues.push(...splitMultiValue(cell, "phone").map((item) => ({ value: item, label: cleanImportValue(raw[`${header} Label`]) || null })));
        else if (target.field === "address") looseAddresses.push({ value: cell, label: cleanImportValue(raw[`${header} Label`]) || null });
        else structured[target.field].push(cell);
      } else if (target.kind === "CUSTOM") customFields.set(target.definitionId, cell);
      else if (target.kind === "DATE") {
        const parsed = parseImportDate(cell);
        if (!parsed) {
          errors.push(`Column “${header}” has an invalid date: ${cell}`);
          continue;
        }
        jumpDates.push({
          dateTypeId: target.dateTypeId,
          dateTypeName: target.dateTypeName,
          label: header,
          dateValue: parsed.dateValue,
          month: parsed.month,
          day: parsed.day,
          recurrence: target.recurrence
        });
      }
    }

    const emails = [...new Map(emailValues.map((item) => [normalizeEmail(item.value), item])).entries()].map(([normalized, item], index) => {
      if (!isValidEmail(normalized)) errors.push(`Invalid email address: ${item.value}`);
      return { value: item.value.trim(), label: item.label, isPrimary: index === 0 };
    });
    const phones = [...new Map(phoneValues.map((item) => [normalizePhone(item.value) ?? item.value, item])).entries()].map(([, item], index) => {
      if (!normalizePhone(item.value)) errors.push(`Invalid phone number: ${item.value}`);
      return { value: item.value.trim(), label: item.label, isPrimary: index === 0 };
    });

    const addresses: ImportAddress[] = looseAddresses.map((item, index) => ({
      label: item.label,
      street1: item.value,
      street2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      isPrimary: index === 0
    }));
    const structuredAddress = {
      label: null,
      street1: firstNonempty(structured.street1),
      street2: firstNonempty(structured.street2),
      city: firstNonempty(structured.city),
      state: firstNonempty(structured.state),
      postalCode: firstNonempty(structured.postalCode),
      country: firstNonempty(structured.country),
      isPrimary: addresses.length === 0
    };
    if (Object.entries(structuredAddress).some(([key, value]) => key !== "isPrimary" && Boolean(value))) addresses.unshift(structuredAddress);
    addresses.forEach((address, index) => { address.isPrimary = index === 0; });

    const firstName = firstNonempty(firstNames);
    const lastName = firstNonempty(lastNames);
    const importedDisplayName = firstNonempty(displayNames);
    const company = firstNonempty(companies);
    const displayName = importedDisplayName || [firstName, lastName].filter(Boolean).join(" ") || company || emails[0]?.value || phones[0]?.value || null;
    if (!displayName) errors.push("Add a name, company, email, or phone number.");
    if (!emails.length && !phones.length) warnings.push("This Contact has no email or phone number.");

    const sourceRow = table.rowNumbers[rowIndex] ?? rowIndex + 1;
    return {
      record: {
        rowId: `row-${sourceRow}-${stableImportHash(JSON.stringify(raw))}`,
        sourceRow,
        source: table.source,
        firstName,
        lastName,
        displayName,
        company,
        publicNotes: notes.length ? notes.join("\n") : null,
        emails,
        phones,
        addresses,
        groupIds: [...new Set(groupIds.filter(Boolean))],
        customFields: [...customFields.entries()].map(([definitionId, value]) => ({ definitionId, value })),
        jumpDates
      },
      raw,
      errors: [...new Set(errors)],
      warnings: [...new Set(warnings)]
    };
  });
}
