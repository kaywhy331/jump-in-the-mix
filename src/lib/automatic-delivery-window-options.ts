// Pure presentation constants: safe to share with the browser and preview API.
export const AUTOMATIC_DELIVERY_WINDOWS = [
  { minutes: 15, label: "15 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 240, label: "4 hours" },
  { minutes: 1440, label: "24 hours" }
] as const;

export const DEFAULT_AUTOMATIC_DELIVERY_WINDOW = 30;

export function isAutomaticDeliveryWindowChoice(minutes: number): boolean {
  return AUTOMATIC_DELIVERY_WINDOWS.some(choice => choice.minutes === minutes);
}

export function automaticDeliveryPreviewMinutes(minutes: number): number {
  return isAutomaticDeliveryWindowChoice(minutes) ? minutes : DEFAULT_AUTOMATIC_DELIVERY_WINDOW;
}
