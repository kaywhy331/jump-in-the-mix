/**
 * Compatibility exports for older route modules.
 *
 * This file intentionally contains no mutation implementation or `use server`
 * directive. Every export is delegated to a narrowly scoped Server Action
 * module so stale authentication, scheduling, and entitlement logic cannot
 * remain live in a catch-all action surface.
 */

export { registerAction, loginAction, demoLoginAction, logoutAction } from "@/lib/auth-actions";
export { completeOnboardingAction, skipOnboardingAction } from "@/lib/onboarding-actions";
export { createContactAction, updateContactAction } from "@/lib/contact-actions";
export { archiveContactAction } from "@/lib/contact-lifecycle-actions";
export {
  createContactGroupAction as createGroupAction,
  deleteContactGroupAction as deleteGroupAction
} from "@/lib/group-actions";
export { updateJumpStatusAction } from "@/lib/jump-status-actions";
export { snoozeJumpAction } from "@/lib/snooze-actions";
export {
  createImportantDateAction,
  deactivateImportantDateAction as deleteJumpDateAction
} from "@/lib/important-date-actions";
export { createStarterMixAction } from "@/lib/starter-mix-actions";
export { activateMixAction, pauseMixAction, archiveMixAction } from "@/lib/mix-lifecycle-actions";
export { assignMixToContactAction, removeMixAssignmentAction } from "@/lib/contact-mix-actions";
export { saveMixAction } from "@/lib/mix-editor-actions";
export { updateWorkspaceProfileAction as updateWorkspaceSettingsAction } from "@/lib/workspace-profile-actions";
