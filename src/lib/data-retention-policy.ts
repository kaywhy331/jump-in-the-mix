export const RETENTION_DAYS = {
  providerDetails: 30,
  unusableInvitationPayload: 30,
  unconfirmedWaitlist: 30,
  completedSupport: 180,
  emailDetails: 400,
  emailAttempts: 400,
  platformAudit: 400,
  expiredVerification: 30
} as const;
export const RETENTION_BATCH_SIZE = 100;
export const RETENTION_STALE_MS = 24 * 60 * 60_000;
export const RETENTION_COUNT_LABELS = {
  invitationPayloads: "Invitation email payloads removed", invitationTokens: "Unusable access tokens removed",
  emailDetails: "Email records minimized", providerDetails: "Provider events minimized", emailAttempts: "Old email attempts removed",
  providerReferences: "Old provider references removed",
  unconfirmedWaitlist: "Unconfirmed waitlist requests removed", expiredVerification: "Expired verification records removed",
  supportConversations: "Inactive support conversations removed", supportMessages: "Support messages removed",
  expiredSupportViews: "Expired support views removed", platformAudit: "Old platform audit records removed"
} as const;
export const SUPPORT_RETENTION_NOTICE = `Resolved and closed conversations are removed after ${RETENTION_DAYS.completedSupport} days without activity. Open conversations and pending support emails are kept until they are handled.`;
