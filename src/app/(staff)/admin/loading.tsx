import { ADMIN_LOADING_TITLE } from "./loading-content";

/** Placeholder cards that hold the page's place while it loads. */
const SKELETON_CARDS = ["summary", "detail"] as const;

/** A staff page loads inside the admin shell, so the staff navigation stays usable. */
export default function AdminLoading() {
  return <div className="page" role="status" aria-live="polite" aria-busy="true">
    <header className="page-header"><div><h2>{ADMIN_LOADING_TITLE}</h2><p>You can still use the navigation.</p></div></header>
    {SKELETON_CARDS.map(card => <section key={card} className="card" aria-hidden="true" data-skeleton={card} />)}
  </div>;
}
