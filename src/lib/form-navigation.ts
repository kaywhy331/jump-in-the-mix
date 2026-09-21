export const BEFORE_FORM_NAVIGATION = "jitm:before-form-navigation";

/** Give mounted draft guards a chance to cancel programmatic navigation. */
export function allowFormNavigation(href: string) {
  return window.dispatchEvent(new CustomEvent(BEFORE_FORM_NAVIGATION, { cancelable: true, detail: { href } }));
}
