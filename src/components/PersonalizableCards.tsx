"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";

export type PersonalizableCardItem = {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  actions?: ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
};

function storedStringArray(key: string): string[] | null {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export function PersonalizableCardBoard({
  storageKey,
  items,
  className = "personalizable-card-board"
}: {
  storageKey: string;
  items: PersonalizableCardItem[];
  className?: string;
}) {
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const defaultCollapsed = useMemo(
    () => items.filter((item) => item.defaultCollapsed).map((item) => item.id),
    [items]
  );
  const [order, setOrder] = useState(itemIds);
  const [collapsed, setCollapsed] = useState<string[]>(defaultCollapsed);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const savedOrder = storedStringArray(`${storageKey}:order`);
    const savedCollapsed = storedStringArray(`${storageKey}:collapsed`);
    setOrder(savedOrder
      ? [...savedOrder.filter((id) => itemIds.includes(id)), ...itemIds.filter((id) => !savedOrder.includes(id))]
      : itemIds);
    setCollapsed(savedCollapsed?.filter((id) => itemIds.includes(id)) ?? defaultCollapsed);
    setHydrated(true);
  }, [defaultCollapsed, itemIds, storageKey]);

  useEffect(() => {
    const openLinkedCard = () => {
      const linkedId = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!linkedId || !itemIds.includes(linkedId)) return;
      setCollapsed((current) => current.filter((id) => id !== linkedId));
      window.setTimeout(() => document.getElementById(linkedId)?.scrollIntoView({ block: "start" }), 0);
    };
    openLinkedCard();
    window.addEventListener("hashchange", openLinkedCard);
    return () => window.removeEventListener("hashchange", openLinkedCard);
  }, [itemIds]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(`${storageKey}:order`, JSON.stringify(order));
    window.localStorage.setItem(`${storageKey}:collapsed`, JSON.stringify(collapsed));
  }, [collapsed, hydrated, order, storageKey]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const orderedItems = order.flatMap((id) => {
    const item = itemById.get(id);
    return item ? [item] : [];
  });

  const move = (id: string, direction: -1 | 1) => {
    setOrder((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const toggle = (id: string) => {
    setCollapsed((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  return (
    <div className={className} data-personalizable-card-board>
      {orderedItems.map((item, index) => {
        const isCollapsed = collapsed.includes(item.id);
        return (
          <section
            className={`card personalizable-card${item.className ? ` ${item.className}` : ""}`}
            id={item.id}
            key={item.id}
            data-user-card={item.id}
          >
            <div className="personalizable-card-header">
              <button
                className="personalizable-card-toggle"
                type="button"
                aria-expanded={!isCollapsed}
                aria-controls={`${item.id}-content`}
                onClick={() => toggle(item.id)}
              >
                <span>
                  <strong>{item.title}</strong>
                  {item.description && <small>{item.description}</small>}
                </span>
                <AppIcon name={isCollapsed ? "chevronDown" : "chevronUp"} />
              </button>
              <div className="personalizable-card-controls">
                {item.actions}
                <button
                  className="icon-button compact"
                  type="button"
                  onClick={() => move(item.id, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${item.title} up`}
                  title="Move card up"
                >
                  <AppIcon name="arrowUp" />
                </button>
                <button
                  className="icon-button compact"
                  type="button"
                  onClick={() => move(item.id, 1)}
                  disabled={index === orderedItems.length - 1}
                  aria-label={`Move ${item.title} down`}
                  title="Move card down"
                >
                  <AppIcon name="arrowDown" />
                </button>
              </div>
            </div>
            <div id={`${item.id}-content`} className="personalizable-card-content" hidden={isCollapsed}>
              {item.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
