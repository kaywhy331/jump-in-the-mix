import { prisma } from "../../src/lib/prisma";

// Tests deliberately opt in to roomy capacity; application defaults stay closed.
// Suites using this singleton run serially and restore the original policy.
export async function openTestAdmission() {
  if (!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "")) throw new Error("Admission fixtures require a disposable loopback test database.");
  const previous = await prisma.admissionPolicy.findUnique({ where: { id: "default" } });
  const data = { accountCeiling: 1_000_000, outstandingCeiling: 1_000_000, collectionPaused: false, grantsPaused: false, referralsPaused: false, redemptionPaused: false };
  await prisma.admissionPolicy.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  return async () => {
    if (previous) await prisma.admissionPolicy.upsert({ where: { id: "default" }, create: previous, update: previous });
    else await prisma.admissionPolicy.deleteMany({ where: { id: "default" } });
  };
}
