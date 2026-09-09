import { prisma } from "@/lib/prisma";
import { READY_MADE_PLANS } from "@/lib/vertical-plan-library";
import { publishReadyMadePlans } from "@/lib/publish-plan-library";
import { installSystemMixBaseline } from "@/lib/system-mix-store";

const systemDateTypes = [
  ["system_birthday", "Birthday", "birthday"],
  ["system_anniversary", "Anniversary", "anniversary"],
  ["system_follow_up", "Follow-up", "follow-up"],
  ["system_renewal", "Renewal", "renewal"],
  ["system_appointment", "Appointment", "appointment"],
  ["system_event", "Event", "event"],
  ["system_referral", "Referral", "referral"],
  ["system_closed_deal", "Closed Deal", "closed-deal"]
] as const;

// Only install missing shipped data. Repeated deploys preserve administrator
// edits, disabled date types, library drafts and withdrawn publications.
export async function installApplicationCatalog() {
  await installSystemMixBaseline();
  const dates = await prisma.dateType.createMany({
    data: systemDateTypes.map(([id, name, slug]) => ({ id, scopeKey: "system", name, slug, isSystem: true, isActive: true })),
    skipDuplicates: true
  });
  const plans = await publishReadyMadePlans(READY_MADE_PLANS);
  return { dateTypesCreated: dates.count, plansCreated: plans.created, plansUnchanged: plans.unchanged };
}
