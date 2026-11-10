/**
 * The two states a refresh or import reads a calendar connection in. A connect or import request
 * creates its connection pending: turned off and never synced. Every refresh reads connected rows
 * only, so it ignores a pending one. Only that request's first refresh or import reads the pending
 * row, and it turns the row on in the same transaction that writes its busy times. A first refresh
 * that fails therefore never leaves a usable connection, even when removing the row is refused
 * (JITM-UXS-02, DATA-01). Each value is both the filter a refresh reads with and, for pending, the
 * data a new connection is created with.
 */
export const CALENDAR_CONNECTION_STAGES = {
  pending: { enabled: false, lastSyncedAt: null },
  connected: { enabled: true }
} as const;
export type CalendarConnectionStage = keyof typeof CALENDAR_CONNECTION_STAGES;
