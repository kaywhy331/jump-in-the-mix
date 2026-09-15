import type { Channel } from "@/generated/prisma/client";
import { PREPARATION_FAMILIES, preparationFamilyForChannel, type DraftContent, type PreparationFamily } from "@/lib/preparation-family";

/**
 * One follow-up, channel alternatives. A beat's step version carries its primary channel's
 * wording; authored variants add wording for the other families. On Today the owner may switch
 * between the usable ones: authored, valid for the family, and with a recipient method the
 * contact actually has. Switching selects which wording and channel a handoff freezes; it never
 * creates another scheduled action, never sends anything, and never invents wording.
 */
export type VariantTemplates = Partial<Record<PreparationFamily, DraftContent>>;

export type PreparedVariant = {
  family: PreparationFamily;
  channel: Channel;
  template: DraftContent;
  /** True for the plan's own channel, the wording the follow-up was generated with. */
  primary: boolean;
};

export type RecipientMethods = {
  email: string | null;
  phone: string | null;
  /** The contact's explicit preference; WhatsApp is offered only when it is stated here. */
  preferredChannel: Channel | null;
};

const blank = (value: string | null | undefined) => !value || !value.trim();

/** Whether wording exists for the family: a text or email needs a body, a call needs its notes. */
export function authoredVariant(family: PreparationFamily, content: DraftContent | null | undefined): boolean {
  if (!content) return false;
  return family === "CALL" ? !blank(content.script) : !blank(content.body);
}

/** Only the fields a family carries, so a call variant never holds outward wording and a text never holds notes. */
export function variantFieldsForFamily(family: PreparationFamily, content: Partial<DraftContent>): DraftContent {
  return {
    subject: family === "EMAIL" ? content.subject ?? null : null,
    body: family === "TEXT" || family === "EMAIL" ? content.body ?? null : null,
    script: family === "CALL" ? content.script ?? null : null
  };
}

/** The authored variants recorded on a follow-up's template snapshot; empty for a single-channel row. */
export function variantsOfSnapshot(snapshot: unknown): VariantTemplates {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  const raw = (snapshot as Record<string, unknown>).variants;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const variants: VariantTemplates = {};
  for (const family of PREPARATION_FAMILIES) {
    const item = (raw as Record<string, unknown>)[family];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const text = (key: keyof DraftContent) => { const value = (item as Record<string, unknown>)[key]; return typeof value === "string" ? value : null; };
    const content = variantFieldsForFamily(family, { subject: text("subject"), body: text("body"), script: text("script") });
    if (authoredVariant(family, content)) variants[family] = content;
  }
  return variants;
}

/** The snapshot form of stored variant rows: authored ones only, keyed by family. */
export function variantTemplatesOf(rows: Array<{ family: PreparationFamily; subject: string | null; body: string | null; script: string | null }>): VariantTemplates | undefined {
  const variants: VariantTemplates = {};
  for (const row of rows) {
    const content = variantFieldsForFamily(row.family, row);
    if (authoredVariant(row.family, content)) variants[row.family] = content;
  }
  return Object.keys(variants).length ? variants : undefined;
}

/** The channel a text goes out on: WhatsApp only when the contact says so, never inferred. */
export function textChannelFor(methods: Pick<RecipientMethods, "preferredChannel">): Channel {
  return methods.preferredChannel === "WHATSAPP" ? "WHATSAPP" : "SMS";
}

/** The channels a handoff may record for a variant family, given the contact's stated preference. */
export function variantChannels(family: PreparationFamily, methods: Pick<RecipientMethods, "preferredChannel">): Channel[] {
  if (family === "EMAIL") return ["EMAIL"];
  if (family === "CALL") return ["PHONE_CALL"];
  return methods.preferredChannel === "WHATSAPP" ? ["SMS", "WHATSAPP"] : ["SMS"];
}

/**
 * The primary wording first, then each authored variant for another family, with the channel a
 * handoff would use. A variant for the primary's own family is ignored: the plan's channel owns it.
 */
export function preparedVariants(primary: { channel: Channel; template: DraftContent }, variants: VariantTemplates, methods: Pick<RecipientMethods, "preferredChannel">): PreparedVariant[] {
  const primaryFamily = preparationFamilyForChannel(primary.channel);
  const prepared: PreparedVariant[] = [{ family: primaryFamily, channel: primary.channel, template: primary.template, primary: true }];
  for (const family of PREPARATION_FAMILIES) {
    if (family === primaryFamily) continue;
    const template = variants[family];
    if (!authoredVariant(family, template)) continue;
    prepared.push({ family, channel: family === "TEXT" ? textChannelFor(methods) : family === "EMAIL" ? "EMAIL" : "PHONE_CALL", template: template!, primary: false });
  }
  return prepared;
}

function methodFor(channel: Channel, methods: RecipientMethods): string | null {
  return channel === "EMAIL" ? methods.email : methods.phone;
}

/** The variants the owner can actually use now: authored, and with the recipient method the channel needs. */
export function usableVariants(prepared: PreparedVariant[], methods: RecipientMethods): PreparedVariant[] {
  return prepared.filter((variant) => Boolean(methodFor(variant.channel, methods)));
}

/**
 * The variant the card shows: the owner's explicit choice while it is usable, otherwise the plan's
 * own channel, otherwise the first usable alternative; null when nothing can be handed off.
 */
export function selectedVariant(usable: PreparedVariant[], selectedFamily: PreparationFamily | null | undefined): PreparedVariant | null {
  return usable.find((variant) => selectedFamily && variant.family === selectedFamily)
    ?? usable.find((variant) => variant.primary)
    ?? usable[0]
    ?? null;
}

/** The switcher appears only when there is a real choice. */
export function offersChoice(usable: PreparedVariant[]): boolean {
  return usable.length > 1;
}

/** Families a follow-up accepts a draft or an attempt for: the plan's own and every authored variant. */
export function authoredFamilies(primaryChannel: Channel, snapshot: unknown): PreparationFamily[] {
  const variants = variantsOfSnapshot(snapshot);
  return [preparationFamilyForChannel(primaryChannel), ...PREPARATION_FAMILIES.filter((family) => family !== preparationFamilyForChannel(primaryChannel) && Boolean(variants[family]))];
}

/** Whether a handoff on this channel is legitimate for the follow-up: its own channel, or an authored variant's. */
export function attemptChannelAllowed(input: { primaryChannel: Channel; snapshot: unknown; channel: Channel; family: PreparationFamily; preferredChannel: Channel | null }): boolean {
  if (input.channel === input.primaryChannel) return input.family === preparationFamilyForChannel(input.primaryChannel);
  if (input.family === preparationFamilyForChannel(input.primaryChannel)) return false;
  if (!variantsOfSnapshot(input.snapshot)[input.family]) return false;
  return variantChannels(input.family, { preferredChannel: input.preferredChannel }).includes(input.channel);
}
