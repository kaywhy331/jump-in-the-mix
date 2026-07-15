import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { createContactAction } from "@/lib/actions";

export const metadata: Metadata = { title: "Add contact" };

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="page">
      <header className="page-header"><div><h1>Add a contact</h1><p>Only one identifying detail is required. Fill in the rest when it becomes useful.</p></div></header>
      {error && <Notice type="error">{error}</Notice>}
      <section className="card">
        <form action={createContactAction} className="form-grid">
          <div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" autoFocus /></div>
          <div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" /></div>
          <div className="field full"><label htmlFor="company">Company</label><input id="company" name="company" /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" /></div>
          <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" /></div>
          <div className="field full"><label htmlFor="notes">Private context</label><textarea id="notes" name="notes" placeholder="Optional notes for your own reference. Default message templates will not insert these notes automatically." /></div>
          <div className="form-actions field full"><Link className="button" href="/contacts">Cancel</Link><button className="button primary" type="submit">Save contact</button></div>
        </form>
      </section>
    </div>
  );
}
