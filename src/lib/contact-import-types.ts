export type ContactImportSource = "CSV" | "VCF";
export type ImportRecurrence = "NONE" | "MONTHLY" | "YEARLY";
export type ImportResolutionAction = "CREATE" | "MERGE" | "REPLACE" | "SKIP";

export type ParsedImportTable = {
  source: ContactImportSource;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  rowNumbers: number[];
  warnings: string[];
};

export type ImportDateTypeOption = {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  isActive: boolean;
};

export type ImportCustomFieldOption = {
  id: string;
  name: string;
  key: string;
};

export type ImportEmail = { value: string; label: string | null; isPrimary: boolean };
export type ImportPhone = { value: string; label: string | null; isPrimary: boolean };

export type ImportAddress = {
  label: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  isPrimary: boolean;
};

export type ImportCustomFieldValue = { definitionId: string; value: string };

export type ImportJumpDate = {
  dateTypeId: string | null;
  dateTypeName: string | null;
  label: string | null;
  dateValue: string | null;
  month: number | null;
  day: number | null;
  recurrence: ImportRecurrence;
};

export type ImportContactRecord = {
  rowId: string;
  sourceRow: number;
  source: ContactImportSource;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  company: string | null;
  publicNotes: string | null;
  emails: ImportEmail[];
  phones: ImportPhone[];
  addresses: ImportAddress[];
  groupIds: string[];
  customFields: ImportCustomFieldValue[];
  jumpDates: ImportJumpDate[];
};

export type PreparedImportRow = {
  record: ImportContactRecord;
  raw: Record<string, string>;
  errors: string[];
  warnings: string[];
};

export type ImportMatchCandidate = {
  contactId: string;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  matchReasons: string[];
  confidence: "EXACT" | "FUZZY";
};

export type ImportMatch = {
  rowId: string;
  kind: "NONE" | "EXACT" | "AMBIGUOUS" | "FUZZY";
  candidates: ImportMatchCandidate[];
  recommendedAction: ImportResolutionAction;
};

export type ImportResolution = {
  rowId: string;
  action: ImportResolutionAction;
  targetContactId: string | null;
};

export type ImportCommitResult = {
  rowId: string;
  sourceRow: number;
  status: "CREATED" | "MERGED" | "REPLACED" | "SKIPPED" | "FAILED";
  contactId: string | null;
  message: string;
};

export type ImportSummary = {
  created: number;
  merged: number;
  replaced: number;
  skipped: number;
  failed: number;
  results: ImportCommitResult[];
};

export type ImportField =
  | "firstName"
  | "lastName"
  | "displayName"
  | "company"
  | "email"
  | "phone"
  | "address"
  | "street1"
  | "street2"
  | "city"
  | "state"
  | "postalCode"
  | "country"
  | "publicNotes";

export type ImportMappingTarget =
  | { kind: "IGNORE" }
  | { kind: "FIELD"; field: ImportField }
  | { kind: "CUSTOM"; definitionId: string }
  | { kind: "DATE"; dateTypeId: string | null; dateTypeName: string | null; recurrence: ImportRecurrence };

export type ImportColumnMapping = Record<string, string>;
