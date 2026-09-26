export type QuietDaySuggestion = { contactId: string; name: string; stage: string | null; dueDate: string; cycle: string; nextJumpId: string | null };
export type QuietDayPage = { enabled: boolean; days: number; total: number; stageIds: string[]; page: number; pages: number; items: QuietDaySuggestion[] };
