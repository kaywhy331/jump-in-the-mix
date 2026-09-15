import { isPreparationFamily, preparationFamilyForChannel, type PreparationFamily } from "@/lib/preparation-family";
import { authoredFamilies } from "@/lib/preparation-variants";
import { prisma } from "@/lib/prisma";

export type SelectVariantResult = { ok: true; selectedFamily: PreparationFamily | null } | { ok: false; reason: "invalid" | "unavailable"; message: string };

/**
 * Records which channel family the owner chose for one pending follow-up. Null returns to the
 * plan's own channel. Only an authored family is accepted, so a card never selects wording that
 * does not exist; recipient methods are the card's concern when it offers the choice. The
 * selection changes nothing else: no row is created, nothing is sent, drafts stay per family.
 */
export async function selectJumpVariant(input: { workspaceId: string; jumpId: string; family: unknown }): Promise<SelectVariantResult> {
  if (input.family !== null && !isPreparationFamily(input.family)) return { ok: false, reason: "invalid", message: "Choose a valid message type." };
  const jump = await prisma.jump.findFirst({
    where: { id: input.jumpId, workspaceId: input.workspaceId, status: "PENDING" },
    select: { templateSnapshot: true, stepVersion: { select: { stepTemplate: { select: { channel: true } } } } }
  });
  if (!jump) return { ok: false, reason: "unavailable", message: "This follow-up is no longer open." };
  const primary = preparationFamilyForChannel(jump.stepVersion.stepTemplate.channel);
  const family = input.family === null || input.family === primary ? null : input.family;
  if (family && !authoredFamilies(jump.stepVersion.stepTemplate.channel, jump.templateSnapshot).includes(family)) {
    return { ok: false, reason: "invalid", message: "This follow-up has no wording prepared for that channel." };
  }
  const updated = await prisma.jump.updateMany({ where: { id: input.jumpId, workspaceId: input.workspaceId, status: "PENDING" }, data: { selectedFamily: family } });
  if (updated.count !== 1) return { ok: false, reason: "unavailable", message: "This follow-up is no longer open." };
  return { ok: true, selectedFamily: family };
}
