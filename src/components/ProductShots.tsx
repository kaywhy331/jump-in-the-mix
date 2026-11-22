// Real screens of the app, captured from the fictional demo workspace by
// scripts/capture-product-shots.mjs (JITM-03 §2.19). Both themes ship; CSS shows the one that
// matches the page, and lazy loading leaves the hidden theme and the other screen size unrequested.
const SHOTS = [
  {
    name: "today-desktop", size: "wide", width: 1920, height: 1364,
    caption: "Today, with the review beside the list",
    alt: "Today on a computer, shown with fictional people. Three follow-ups need attention, one of them overdue. Beside the list, the overdue text to Marcus Reed is open for review, with its draft message and the Open text, Copy and Mark sent buttons."
  },
  {
    name: "today-phone", size: "narrow", width: 600, height: 1298,
    caption: "Today on a phone",
    alt: "Today on a phone, shown with fictional people: an overdue text to Marcus Reed with its draft message and a Review button, then a call to Marcus and a text to Sarah Chen."
  },
  {
    name: "review-phone", size: "phone", width: 600, height: 1298,
    caption: "The review on a phone",
    alt: "The review on a phone, shown with fictional people: the draft text to Marcus Reed, a choice of text, email or call, and the Open text, Copy and Mark sent buttons."
  }
] as const;

export function ProductShots() {
  return <div className="product-shots">
    {SHOTS.map(shot => <figure key={shot.name} className={`product-shot product-shot--${shot.size}`}>
      {(["light", "dark"] as const).map(theme => <img key={theme} className={`product-shot-${theme}`} src={`/product-shots/${shot.name}-${theme}.webp`} width={shot.width} height={shot.height} alt={shot.alt} loading="lazy" decoding="async" />)}
      <figcaption>{shot.caption}</figcaption>
    </figure>)}
    <p className="product-shots-note">Screens from the app, shown with a sample workspace and fictional people.</p>
  </div>;
}
