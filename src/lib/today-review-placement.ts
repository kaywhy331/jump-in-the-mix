export type TodayDueSection = "overdue" | "today";
export type TodayDueGroup = { contactId: string; section: TodayDueSection; jumpIds: string[] };
export type TodayReviewPin = { contactId: string; jumpId: string; section: TodayDueSection };

/** Keep an open review's person in the same section (D112), preserving the server's due order within each section.
 * Use only the fresh read's cards:
 * completing, removing or filtering out the reviewed follow-up never keeps a stale card alive. */
export function placeTodayGroups<T extends TodayDueGroup>(groups: readonly T[], pin: TodayReviewPin | null) {
  const held = pin && groups.find(group => group.contactId === pin.contactId && group.jumpIds.includes(pin.jumpId));
  const overdue: T[] = [], today: T[] = [];
  let overdueAdjustment = 0;
  for (const group of groups) {
    const section = group === held ? pin!.section : group.section;
    (section === "overdue" ? overdue : today).push(group);
    if (section !== group.section) overdueAdjustment += group.jumpIds.length * (section === "overdue" ? 1 : -1);
  }
  return { overdue, today, overdueAdjustment };
}
