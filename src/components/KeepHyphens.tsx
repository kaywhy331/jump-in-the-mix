// Headings never break a hyphenated word such as "follow-up" at its hyphen (JITM-06 §2.35). Each such
// word is one atomic inline box, so it moves to the next line whole; only a word wider than its column
// wraps inside. The text, its hyphen and the font's own glyph stay as written (Instrument Sans has no
// non-breaking hyphen glyph, U+2011).
export function KeepHyphens({ children }: { children: string }) {
  return <>{children.split(/(\S+-\S+)/).map((part, index) => index % 2 ? <span key={index} className="keep-hyphens">{part}</span> : part)}</>;
}
