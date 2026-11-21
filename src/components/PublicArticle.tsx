import { PublicCapabilities } from "@/components/PublicCapabilities";
import { PublicContents } from "@/components/PublicContents";
import type { ReactNode } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { KeepHyphens } from "@/components/KeepHyphens";

// The reading shell for the template and feature pages: the public header and footer around one
// article with a visible H1, so the useful text and links are in the HTML for every visitor.
// `current` is the page's own path when the header links to it.
export function PublicArticle({ title, deck, intro, current, children }: { title: string; deck?: string; intro?: ReactNode; current?: string; children: ReactNode }) {
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <PublicHeader current={current} />
    <main id="main-content" tabIndex={-1}>
      <article className="section public-article">
        <div className="section-heading"><h1 className="public-title"><KeepHyphens>{title}</KeepHyphens></h1>{deck && <p className="public-article-deck">{deck}</p>}</div>
        {intro}
        <PublicContents />
        {children}
        <PublicCapabilities />
      </article>
    </main>
    <PublicFooter />
  </div>;
}

// A copyable example: a message (with an optional email subject) and the copy action beneath it.
export function TemplateExample({ subject, children }: { subject?: string; children: ReactNode }) {
  return <figure className="template-example">{subject && <p className="template-subject">Subject: {subject}</p>}<blockquote>{children}</blockquote></figure>;
}
