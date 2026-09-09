export class EmailDeliveryError extends Error {
  attempted = false;
  constructor(
    public readonly code: "BUDGET" | "SUPPRESSED" | "REVIEW" | "MISMATCH" | "PROVIDER",
    message: string,
    public readonly firstAttemptAt: Date | null = null,
    public readonly retryAt?: Date
  ) { super(message); this.name = "EmailDeliveryError"; }
}
