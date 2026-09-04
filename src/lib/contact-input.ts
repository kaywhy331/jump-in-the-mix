export type ContactMethodInput = {
  value: string;
  normalized: string;
  label: string | null;
  isPrimary: boolean;
};

export type ContactAddressInput = {
  id?: string;
  label: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  isPrimary: boolean;
};

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function requestedPrimaryIndex(raw: string | undefined, length: number): number | null {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < length ? parsed : null;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const normalized = normalizeEmail(value);
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function buildEmailInputs(values: string[], labels: string[], primaryRaw?: string): ContactMethodInput[] {
  const requestedIndex = requestedPrimaryIndex(primaryRaw, values.length);
  let requestedKey: string | null = null;
  const deduped = new Map<string, { value: string; label: string | null }>();
  for (let index = 0; index < values.length; index += 1) {
    const value = clean(values[index]);
    if (!value) continue;
    const normalized = normalizeEmail(value);
    if (!isValidEmail(normalized)) throw new Error(`Invalid email address: ${value}`);
    if (index === requestedIndex) requestedKey = normalized;
    if (!deduped.has(normalized)) deduped.set(normalized, { value, label: clean(labels[index]) || null });
  }
  const rows = [...deduped.entries()];
  const primaryKey = requestedKey && deduped.has(requestedKey) ? requestedKey : rows[0]?.[0] ?? null;
  return rows.map(([normalized, item]) => ({
    value: item.value,
    normalized,
    label: item.label,
    isPrimary: normalized === primaryKey
  }));
}

export function buildPhoneInputs(values: string[], labels: string[], primaryRaw?: string): ContactMethodInput[] {
  const requestedIndex = requestedPrimaryIndex(primaryRaw, values.length);
  let requestedKey: string | null = null;
  const deduped = new Map<string, { value: string; label: string | null }>();
  for (let index = 0; index < values.length; index += 1) {
    const value = clean(values[index]);
    if (!value) continue;
    const normalized = normalizePhone(value);
    if (!normalized) throw new Error(`Invalid phone number: ${value}`);
    if (index === requestedIndex) requestedKey = normalized;
    if (!deduped.has(normalized)) deduped.set(normalized, { value, label: clean(labels[index]) || null });
  }
  const rows = [...deduped.entries()];
  const primaryKey = requestedKey && deduped.has(requestedKey) ? requestedKey : rows[0]?.[0] ?? null;
  return rows.map(([normalized, item]) => ({
    value: item.value,
    normalized,
    label: item.label,
    isPrimary: normalized === primaryKey
  }));
}

export function buildAddressInputs(
  street1Values: string[],
  street2Values: string[],
  cityValues: string[],
  stateValues: string[],
  postalCodeValues: string[],
  countryValues: string[],
  labels: string[],
  primaryRaw?: string,
  ids: string[] = []
): ContactAddressInput[] {
  const rowCount = Math.max(
    street1Values.length,
    street2Values.length,
    cityValues.length,
    stateValues.length,
    postalCodeValues.length,
    countryValues.length,
    labels.length
  );
  const requestedIndex = requestedPrimaryIndex(primaryRaw, rowCount);
  const rows: Array<{ originalIndex: number; row: Omit<ContactAddressInput, "isPrimary"> }> = [];
  for (let index = 0; index < rowCount; index += 1) {
    const row = {
      id: clean(ids[index]) || undefined,
      label: clean(labels[index]) || null,
      street1: clean(street1Values[index]) || null,
      street2: clean(street2Values[index]) || null,
      city: clean(cityValues[index]) || null,
      state: clean(stateValues[index]) || null,
      postalCode: clean(postalCodeValues[index]) || null,
      country: clean(countryValues[index]) || null
    };
    const hasAddressValue = Boolean(row.street1 || row.street2 || row.city || row.state || row.postalCode || row.country);
    if (hasAddressValue) rows.push({ originalIndex: index, row });
  }
  const selectedPosition = requestedIndex === null
    ? -1
    : rows.findIndex((item) => item.originalIndex === requestedIndex);
  const primaryPosition = selectedPosition >= 0 ? selectedPosition : rows.length ? 0 : -1;
  return rows.map((item, index) => ({ ...item.row, isPrimary: index === primaryPosition }));
}
