import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("best-in-class product workflows", () => {
  it("keeps autonomous sending explicitly opt-in with a review window and no ambiguous retry", () => {
    const schema = read("prisma/product-platform.prisma");
    const settings = read("src/app/(app)/settings/notifications/page.tsx");
    const delivery = read("src/lib/automatic-delivery.ts");
    const worker = read("src/worker/index.ts");
    expect(schema).toContain("enabled             Boolean  @default(false)");
    expect(schema).toContain("reviewWindowMinutes Int      @default(30)");
    expect(settings).toContain("automationConsent");
    expect(settings).toContain("without a final tap");
    expect(delivery).toContain("It was not retried to prevent a duplicate message");
    expect(delivery).toContain("isQuietTime");
    expect(worker).toContain("runAutomaticDeliveries");
  });

  it("ships an expiring hashed private-feedback, review, and referral flow", () => {
    const creation = read("src/app/api/contacts/[contactId]/review-request/route.ts");
    const response = read("src/app/api/reviews/[token]/route.ts");
    const publicReview = read("src/app/api/reviews/[token]/public-review/route.ts");
    const referral = read("src/app/api/reviews/[token]/refer/route.ts");
    expect(creation).toContain("hashReviewToken(token)");
    expect(creation).toContain("reviewRequestExpiresAt()");
    expect(response).toContain("reviewResponseStatus(rating)");
    expect(response).toContain("contactActivity.create");
    expect(publicReview).toContain("reviewClickedAt");
    expect(referral).toContain("referralClickedAt");
  });

  it("ships the durable delivery migration through the normal production path", () => {
    const migration = read("prisma/migrations/20260904190000_automatic_delivery_and_reviews/migration.sql");
    const rehearsal = read("scripts/rehearse-migration.mjs");
    expect(migration).toContain('CREATE TABLE "AutomatedDelivery"');
    expect(migration).toContain('UNIQUE INDEX "AutomatedDelivery_jumpId_key"');
    expect(migration).toContain('ALTER TABLE "ReviewRequest" ALTER COLUMN "expiresAt" SET NOT NULL');
    expect(rehearsal).toContain("20260904190000_automatic_delivery_and_reviews");
    expect(rehearsal).toContain('"AutomatedDelivery"');
  });
});
