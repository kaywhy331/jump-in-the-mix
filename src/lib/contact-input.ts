export type ContactMethodInput = {
  value: string;
  normalized: string;
  label: string | null;
  isPrimary: boolean;
};

export type ContactAddressInput = {
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

function selectedPrimaryIndex(raw: string | undefined, length: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < length ? parsed : 0;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function buildEmailInputs(values: string[], labels: string[], primaryRaw?: string): ContactMethodInput[] {
  const deduped = new Map<string, { value: string; label: string | null }>();
  for (let index = 0; index < values.length; index += 1) {
    const value = clean(values[index]);
    if (!value) continue;
    const normalized = normalizeEmail(value);
    if (!isValidEmail(normalized)) throw new Error(`Invalid email address: ${value}`);
    if (!deduped.has(normalized)) deduped.set(normalized, { value, label: clean(labels[index]) || null });
  }
  const rows = [...deduped.entries()];
  const primaryIndex = selectedPrimaryIndex(primaryRaw, rows.length);
  return rows.map(([normalized, item], index) => ({
    value: item.value,
    normalized,
    label: item.label,
    isPrimary: index === primaryIndex
  }));
}

export function buildPhoneInputs(values: string[], labels: string[], primaryRaw?: string): ContactMethodInput[] {
  const deduped = new Map<string, { value: string; label: string | null }>();
  for (let index = 0; index < values.length; index += 1) {
    const value = clean(values[index]);
    if (!value) continue;
    const normalized = normalizePhone(value);
    if (!normalized) throw new Error(`Invalid phone number: ${value}`);
    if (!deduped.has(normalized)) deduped.set(normalized, { value, label: clean(labels[index]) || null });
  }
  const rows = [...deduped.entries()];
  const primaryIndex = selectedPrimaryIndex(primaryRaw, rows.length);
  return rows.map(([normalized, item], index) => ({
    value: item.value,
    normalized,
    label: item.label,
    isPrimary: index === primaryIndex
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
  primaryRaw?: string
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
  const rows: Omit<ContactAddressInput, "isPrimary">[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    const row = {
      label: clean(labels[index]) || null,
      street1: clean(street1Values[index]) || null,
      street2: clean(street2Values[index]) || null,
      city: clean(cityValues[index]) || null,
      state: clean(stateValues[index]) || null,
      postalCode: clean(postalCodeValues[index]) || null,
      country: clean(countryValues[index]) || null
    };
    if (Object.values(row).some(Boolean)) rows.push(row);
  }
  const primaryIndex = selectedPrimaryIndex(primaryRaw, rows.length);
  return rows.map((row, index) => ({ ...row, isPrimary: index === primaryIndex }));
}
