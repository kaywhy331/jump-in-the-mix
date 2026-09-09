export function operationsSourceHash(databaseUrl: string): string;
export function privateJson(path: string, maxBytes?: number): Promise<unknown>;
export function writeOperationsReceipt(path: string | undefined, receipt: Record<string, unknown>): Promise<void>;
export function readOperationsArtifactAges(databaseUrl: string, now?: Date, source?: Readonly<Record<string, string | undefined>>): Promise<{ backupAgeHours: number | null; restoreAgeDays: number | null }>;
