export function todayBriefing(input: { attention: number; overdue: number; markedDone: number; ready: boolean }): string {
  if (!input.ready) return "Your follow-up list is not ready yet. Check its preparation status before relying on these counts.";
  const dueToday = Math.max(0, input.attention - input.overdue);
  const due = `${dueToday} follow-up${dueToday === 1 ? " is" : "s are"} due today`;
  const overdue = input.overdue ? `, and ${input.overdue} ${input.overdue === 1 ? "is" : "are"} overdue` : ", with none overdue";
  const completed = `${input.markedDone} ${input.markedDone === 1 ? "was" : "were"} marked done today.`;
  return `${due}${overdue}. ${completed} ${input.attention ? "Review each follow-up before sending. If someone has replied, update their contact or pause their mix." : "There are no open follow-ups due right now."}`;
}
