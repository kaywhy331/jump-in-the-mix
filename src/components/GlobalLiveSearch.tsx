"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const FILTER_FORM_SELECTOR = [
  "form.filter-bar",
  "form.live-search-form"
].join(",");

function shouldEnhance(form: HTMLFormElement): boolean {
  if (form.dataset.liveFilter === "false") return false;
  if (form.method.toLowerCase() !== "get") return false;
  return Boolean(form.querySelector('input[name="q"], input[type="search"], select'));
}

function targetHref(form: HTMLFormElement): string {
  const target = new URL(form.action || window.location.href, window.location.href);
  const params = new URLSearchParams();
  for (const [key, rawValue] of new FormData(form).entries()) {
    if (rawValue instanceof File) continue;
    const value = rawValue.trim();
    if (value) params.append(key, value);
  }
  const query = params.toString();
  return query ? `${target.pathname}?${query}` : target.pathname;
}

function isTextSearchControl(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement
    && ["search", "text", "email", "tel"].includes(target.type)
    && Boolean(target.name);
}

export function GlobalLiveSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timers = useRef(new Map<HTMLFormElement, number>());

  useEffect(() => {
    const markForms = () => {
      document.querySelectorAll<HTMLFormElement>(FILTER_FORM_SELECTOR).forEach((form) => {
        if (shouldEnhance(form)) form.dataset.liveFilter = "true";
      });
    };

    const navigate = (form: HTMLFormElement) => {
      const timer = timers.current.get(form);
      if (timer) window.clearTimeout(timer);
      timers.current.delete(form);
      form.dataset.livePending = "true";
      router.replace(targetHref(form), { scroll: false });
    };

    const onInput = (event: Event) => {
      if (!isTextSearchControl(event.target)) return;
      const form = event.target.closest<HTMLFormElement>(FILTER_FORM_SELECTOR);
      if (!form || !shouldEnhance(form)) return;
      const existing = timers.current.get(form);
      if (existing) window.clearTimeout(existing);
      timers.current.set(form, window.setTimeout(() => navigate(form), 280));
    };

    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement || target instanceof HTMLInputElement)) return;
      if (isTextSearchControl(target)) return;
      const form = target.closest<HTMLFormElement>(FILTER_FORM_SELECTOR);
      if (!form || !shouldEnhance(form)) return;
      navigate(form);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches(FILTER_FORM_SELECTOR) || !shouldEnhance(form)) return;
      event.preventDefault();
      navigate(form);
    };

    markForms();
    const observer = new MutationObserver(markForms);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    document.addEventListener("submit", onSubmit);

    return () => {
      observer.disconnect();
      document.removeEventListener("input", onInput);
      document.removeEventListener("change", onChange);
      document.removeEventListener("submit", onSubmit);
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    };
  }, [router]);

  useEffect(() => {
    document.querySelectorAll<HTMLFormElement>('[data-live-pending="true"]').forEach((form) => {
      delete form.dataset.livePending;
    });
  }, [pathname, searchParams]);

  return <span className="sr-only" aria-live="polite" id="global-live-search-status" />;
}
