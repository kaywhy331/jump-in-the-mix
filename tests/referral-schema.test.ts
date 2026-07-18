import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/referrals.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260717010000_referral_rewards/migration.sql", "utf8");

describe("referral schema and migration contract", () => {
  it("defines auditable attribution, reward, and account records", () => {
    expect(schema).toContain("model ReferralAccount");
    expect(schema).toContain("model Referral");
    expect(schema).toContain("model ReferralReward");
    expect(schema).toContain("referredWorkspaceId String         @unique");
    expect(schema).toContain("@@unique([referralId, recipient])");
    expect(schema).toContain("BANKED");
    expect(schema).toContain("CAPPED");
  });

  it("creates the complete production database objects and uniqueness boundaries", () => {
    expect(migration).toContain('CREATE TABLE "ReferralAccount"');
    expect(migration).toContain('CREATE TABLE "Referral"');
    expect(migration).toContain('CREATE TABLE "ReferralReward"');
    expect(migration).toContain('CREATE UNIQUE INDEX "ReferralAccount_code_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "Referral_referredWorkspaceId_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "ReferralReward_referralId_recipient_key"');
    expect(migration).toContain('FOREIGN KEY ("referralId") REFERENCES "Referral"("id")');
  });
});
