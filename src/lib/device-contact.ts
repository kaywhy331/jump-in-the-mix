import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/contact-input";
import type { ImportAddress, ImportContactRecord, ImportEmail, ImportPhone } from "@/lib/contact-import-types";

export type DeviceContactAddressInput = {
  addressLines?: Array<string | null | undefined> | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export type DeviceContactInput = {
  names: string[];
  emails: string[];
  phones: string[];
  addresses: DeviceContactAddressInput[];
};

function clean(value: string | null | undefined, maxLength: number): string | null {
  const next = (value ?? "").trim();
  return next ? next.slice(0, maxLength) : null;
}

function uniqueValidValues(
  values: string[],
  keyFor: (value: string) => string | null,
  maxLength: number
): string[] {
  const unique = new Map<string, string>();
  for (const rawValue of values) {
    const value = clean(rawValue, maxLength);
    if (!value) continue;
    const key = keyFor(value);
    if (!key || unique.has(key)) continue;
    unique.set(key, value);
  }
  return [...unique.values()];
}

function addressKey(address: ImportAddress): string {
  return [
    address.street1,
    address.street2,
    address.city,
    address.state,
    address.postalCode,
    address.country
  ].map((value) => (value ?? "").trim().toLowerCase()).join("|");
}

function deviceAddresses(values: DeviceContactAddressInput[]): ImportAddress[] {
  const unique = new Map<string, ImportAddress>();
  for (const value of values.slice(0, 20)) {
    const lines = (value.addressLines ?? [])
      .map((line) => clean(line, 240))
      .filter((line): line is string => Boolean(line));
    const address: ImportAddress = {
      label: null,
      street1: lines[0] ?? null,
      street2: lines.slice(1).join(", ") || null,
      city: clean(value.city, 120),
      state: clean(value.region, 120),
      postalCode: clean(value.postalCode, 40),
      country: clean(value.country, 120),
      isPrimary: false
    };
    if (![address.street1, address.street2, address.city, address.state, address.postalCode, address.country].some(Boolean)) continue;
    const key = addressKey(address);
    if (!unique.has(key)) unique.set(key, address);
  }
  return [...unique.values()].map((address, index) => ({ ...address, isPrimary: index === 0 }));
}

function deviceEmails(values: string[]): ImportEmail[] {
  return uniqueValidValues(
    values,
    (value) => isValidEmail(value) ? normalizeEmail(value) : null,
    320
  ).map((value, index) => ({ value, label: null, isPrimary: index === 0 }));
}

function devicePhones(values: string[]): ImportPhone[] {
  return uniqueValidValues(values, normalizePhone, 80)
    .map((value, index) => ({ value, label: null, isPrimary: index === 0 }));
}

export function deviceContactToImportRecord(
  contact: DeviceContactInput,
  index: number,
  requestId: string
): ImportContactRecord {
  const providedName = clean(contact.names.find((name) => Boolean(name.trim())), 240);
  const emails = deviceEmails(contact.emails);
  const phones = devicePhones(contact.phones);
  const displayName = providedName ?? emails[0]?.value ?? phones[0]?.value ?? null;
  const nameParts = providedName?.split(/\s+/).filter(Boolean) ?? [];

  return {
    rowId: `device-${requestId}-${index + 1}`.slice(0, 160),
    sourceRow: index + 1,
    // The existing import service currently models browser-selected address-book
    // records through the VCF-compatible shape. Newly created Contact rows are
    // immediately reclassified to ContactSource.API by the Quick Add service.
    source: "VCF",
    firstName: nameParts[0] ?? null,
    lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : null,
    displayName,
    company: null,
    publicNotes: null,
    emails,
    phones,
    addresses: deviceAddresses(contact.addresses),
    groupIds: [],
    customFields: [],
    jumpDates: []
  };
}
