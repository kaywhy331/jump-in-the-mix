export const PREPARATION_STATES = ["ready", "preparing", "delayed", "failed"] as const;
export type PreparationState = typeof PREPARATION_STATES[number];
export type PreparationStatus = { state: PreparationState; observedAt: string };

export function isPreparationStatus(value: unknown): value is PreparationStatus {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PreparationStatus>;
  return PREPARATION_STATES.includes(item.state as PreparationState)
    && typeof item.observedAt === "string" && Number.isFinite(Date.parse(item.observedAt));
}
