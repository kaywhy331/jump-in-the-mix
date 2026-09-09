type DeliveryFacts = { acceptedAt?: Date | null; deliveredAt?: Date | null; delayedAt?: Date | null; bouncedAt?: Date | null; complainedAt?: Date | null; suppressedAt?: Date | null; failedAt?: Date | null };

export function emailDeliveryLabel(facts: DeliveryFacts | null | undefined): string {
  if (facts?.complainedAt) return "Marked as spam";
  if (facts?.bouncedAt) return "Bounced";
  if (facts?.suppressedAt) return "Stopped by email provider";
  if (facts?.failedAt) return "Delivery failed";
  if (facts?.deliveredAt) return "Delivered to recipient’s mail server";
  if (facts?.delayedAt) return "Delivery delayed";
  if (facts?.acceptedAt) return "Accepted by email provider";
  return "No provider delivery receipt";
}
