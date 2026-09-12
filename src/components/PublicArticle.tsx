import type { ReactNode } from "react";
import { PublicHeader, type PublicHeaderLink } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

const DEFAULT_LINKS: PublicHeaderLink[] = [{ href: "/#how-it-works", label: "How it works" }, { href: "/faq", label: "Questions" }];

// The reading shell for the template and feature pages: the public header and footer around one
// article with a visible H1, so the useful text and links are in the HTML for every visitor.
export function PublicArticle({ title, deck, links = DEFAULT_LINKS, children }: { title: string; deck?: string; links?: PublicHeaderLink[]; children: ReactNode }) {
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <PublicHeader links={links} />
    <main id="main-content" tabIndex={-1}>
      <article className="section public-article">
        <div className="section-heading"><h1>{title}</h1>{deck && <p className="public-article-deck">{deck}</p>}</div>
        {children}
      </article>
    </main>
    <PublicFooter />
  </div>;
}

// A copyable example: a message (with an optional email subject) and the copy action beneath it.
export function TemplateExample({ subject, children }: { subject?: string; children: ReactNode }) {
  return <figure className="template-example">{subject && <p className="template-subject">Subject: {subject}</p>}<blockquote>{children}</blockquote></figure>;
}
