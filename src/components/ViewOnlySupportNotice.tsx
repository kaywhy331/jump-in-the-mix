import { Notice } from "@/components/Notice";

export const VIEW_ONLY_SETTINGS_MESSAGE = "This support session is view-only. These settings can be read but not changed.";

/** Shown on settings pages while an administrator is viewing a customer's account. */
export function ViewOnlySupportNotice({ message = VIEW_ONLY_SETTINGS_MESSAGE }: { message?: string }) {
  return <Notice type="info">{message}</Notice>;
}
