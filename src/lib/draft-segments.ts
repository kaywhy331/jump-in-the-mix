/**
 * Token-preserving draft edits.
 *
 * A draft is stored in the same double-brace token form the step editor validates, while the owner
 * edits the rendered projection in a plain text field. The projection is modelled as a list of
 * segments: literal text, or a token with the value it resolved to. Every edit is mapped back onto
 * the segments deterministically from the minimal change between the previous and next projection.
 * A change that lands inside a token's rendered span detaches that token into literal text; a
 * change next to it leaves the token intact, so the draft keeps re-rendering from the bound
 * contact and business details. Nothing here guesses at the owner's intent from the text.
 */

export type DraftSegment =
  | { kind: "text"; text: string }
  | { kind: "token"; token: string; text: string };

export type DraftValues = Record<string, string>;

const TOKEN_PATTERN = /{{[^}]+}}/g;

function pushText(segments: DraftSegment[], text: string): void {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last?.kind === "text") last.text += text;
  else segments.push({ kind: "text", text });
}

/** Splits token-form source into segments. Unknown tokens resolve to an empty value, as the scheduler renders them. */
export function parseDraftSource(source: string, values: DraftValues): DraftSegment[] {
  const segments: DraftSegment[] = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) pushText(segments, source.slice(last, index));
    const token = match[0];
    segments.push({ kind: "token", token, text: Object.hasOwn(values, token) ? values[token] : "" });
    last = index + token.length;
  }
  if (last < source.length) pushText(segments, source.slice(last));
  return segments;
}

/** The text the owner sees and sends. */
export function projectDraft(segments: DraftSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

/** The stored form: tokens stay tokens, literal text stays literal. */
export function draftSource(segments: DraftSegment[]): string {
  return segments.map((segment) => (segment.kind === "token" ? segment.token : segment.text)).join("");
}

/** Renders token-form source over the bound values without storing the result. */
export function projectDraftSource(source: string | null | undefined, values: DraftValues): string | null {
  return source == null ? null : projectDraft(parseDraftSource(source, values));
}

type Change = { start: number; end: number; inserted: string };

function minimalChange(previous: string, next: string): Change {
  const shortest = Math.min(previous.length, next.length);
  let prefix = 0;
  while (prefix < shortest && previous[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < shortest - prefix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  return { start: prefix, end: previous.length - suffix, inserted: next.slice(prefix, next.length - suffix) };
}

type Span = { start: number; end: number; segment: DraftSegment };

function spans(segments: DraftSegment[]): Span[] {
  let offset = 0;
  return segments.map((segment) => {
    const span = { start: offset, end: offset + segment.text.length, segment };
    offset = span.end;
    return span;
  });
}

// A change strictly inside a token's rendered span detaches the token.
function touchesTokenInterior(all: Span[], change: Change): boolean {
  return all.some(({ start, end, segment }) => segment.kind === "token" && end > start
    && (change.start === change.end ? change.start > start && change.start < end : change.start < end && change.end > start));
}

/**
 * Typing or deleting repeated characters is ambiguous: inserting "A" before "Alex" reads as an
 * insertion inside the token. Equivalent positions are tried and the first that leaves every
 * token intact wins, so an edit beside a token never detaches it by accident.
 */
function preferredChange(previous: string, all: Span[], change: Change): Change {
  if (!touchesTokenInterior(all, change)) return change;
  const removed = previous.slice(change.start, change.end);
  const pureInsert = removed.length === 0 && change.inserted.length > 0;
  const pureDelete = removed.length > 0 && change.inserted.length === 0;
  if (!pureInsert && !pureDelete) return change;
  const candidates: Change[] = [];
  const text = pureInsert ? change.inserted : removed;
  // Slide left: the same edit one position earlier when the boundary characters match.
  for (let shift = 1, current = text; shift <= change.start; shift++) {
    const boundary = previous[change.start - shift];
    if (boundary !== current[current.length - 1]) break;
    current = boundary + current.slice(0, -1);
    candidates.push({ start: change.start - shift, end: change.end - shift, inserted: pureInsert ? current : "" });
  }
  // Slide right likewise.
  for (let shift = 1, current = text; change.end + shift <= previous.length; shift++) {
    const boundary = previous[change.end + shift - 1];
    if (boundary !== current[0]) break;
    current = current.slice(1) + boundary;
    candidates.push({ start: change.start + shift, end: change.end + shift, inserted: pureInsert ? current : "" });
  }
  return candidates.find((candidate) => !touchesTokenInterior(all, candidate)) ?? change;
}

function copy(segment: DraftSegment): DraftSegment {
  return { ...segment };
}

function withInsertion(all: Span[], point: number, inserted: string): DraftSegment[] {
  const result: DraftSegment[] = [];
  const append = (segment: DraftSegment) => (segment.kind === "token" ? result.push(copy(segment)) : pushText(result, segment.text));
  // Strictly inside a segment: splice. A token that is split this way becomes literal text.
  const inside = all.findIndex(({ start, end }) => start < point && point < end);
  if (inside >= 0) {
    all.forEach(({ start, segment }, index) => {
      if (index !== inside) return append(segment);
      const at = point - start;
      pushText(result, segment.text.slice(0, at) + inserted + segment.text.slice(at));
    });
    return result;
  }
  // At a boundary: join the literal text ending here, else the literal text starting here,
  // else start new literal text ahead of the first segment at or past the point.
  const left = all.findIndex(({ end, start, segment }) => end === point && start < end && segment.kind === "text");
  const right = left >= 0 ? -1 : all.findIndex(({ start, segment }) => start === point && segment.kind === "text");
  const ahead = left >= 0 || right >= 0 ? -1 : all.findIndex(({ start }) => start >= point);
  if (left < 0 && right < 0 && ahead < 0) {
    all.forEach(({ segment }) => append(segment));
    pushText(result, inserted);
    return result;
  }
  all.forEach(({ segment }, index) => {
    if (index === left) return pushText(result, segment.text + inserted);
    if (index === right) return pushText(result, inserted + segment.text);
    if (index === ahead) pushText(result, inserted);
    append(segment);
  });
  return result;
}

/** Maps the edit from `previous` to `next` (both projections) onto the segments. */
export function applyDraftEdit(segments: DraftSegment[], previous: string, next: string): DraftSegment[] {
  if (previous === next) return segments;
  const all = spans(segments);
  const change = preferredChange(previous, all, minimalChange(previous, next));
  if (change.start === change.end) return withInsertion(all, change.start, change.inserted);
  // Replacement or deletion: every overlapping segment collapses into one literal, keeping the
  // untouched text on either side of the change. Zero-length tokens at the edges stay tokens.
  const result: DraftSegment[] = [];
  let literal: string | null = null;
  for (const { start, end, segment } of all) {
    const overlaps = start < change.end && end > change.start;
    if (!overlaps) {
      if (literal !== null) { pushText(result, literal); literal = null; }
      if (segment.kind === "token") result.push(copy(segment));
      else pushText(result, segment.text);
      continue;
    }
    if (literal === null) literal = previous.slice(start, change.start) + change.inserted;
    if (end > change.end) literal += previous.slice(change.end, end);
  }
  if (literal !== null) pushText(result, literal);
  return result;
}

/** Tokens the template used that the draft no longer carries. */
export function detachedTokens(templateSource: string, source: string): string[] {
  const kept = new Set(source.match(TOKEN_PATTERN) ?? []);
  return [...new Set(templateSource.match(TOKEN_PATTERN) ?? [])].filter((token) => !kept.has(token));
}
