import type { Page } from "@playwright/test";

export type SmallText = { tag: string; className: string; text: string; fontSize: number };

/**
 * Visible text below the JITM-10 §2.2 floors inside `scope`. The floors follow the supplied phone design: 11px tab
 * labels, 12px compact action labels and 13px for other text. Text hidden from assistive technology is exempt, unless
 * `floor` asks for one size everywhere: then only screen-reader-only text is skipped.
 */
export async function textBelowFloor(page: Page, { scope = "body", floor }: { scope?: string; floor?: number } = {}): Promise<SmallText[]> {
  return page.locator(`${scope} *:visible`).evaluateAll((elements, fixed) => elements.flatMap((element) => {
    if (!(element instanceof HTMLElement)) return [];
    if (element.closest(fixed ? ".sr-only" : ".sr-only, [aria-hidden='true']")) return [];
    const directText = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    const controlText = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.getAttribute("aria-label") || element.placeholder || element.value
      : element instanceof HTMLSelectElement
        ? element.getAttribute("aria-label") || element.name
        : "";
    const text = directText || controlText;
    if (!text) return [];
    const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
    const minimum = fixed ?? (element.closest(".mobile-nav") ? 11 : element.closest("button, a.button, .button") ? 12 : 13);
    if (!Number.isFinite(fontSize) || fontSize === 0 || fontSize >= minimum) return [];
    return [{ tag: element.tagName.toLowerCase(), className: String(element.className), text: text.slice(0, 100), fontSize }];
  }), floor ?? null);
}
