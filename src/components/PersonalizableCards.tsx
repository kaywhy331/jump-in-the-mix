"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";

export type PersonalizableCardItem = {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  actions?: ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
};

type DropTarget = {
  id: string;
  position: "before" | "after";
} | null;

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
  const boardId = useId().replaceAll(":", "");
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const defaultCollapsed = useMemo(
    () => items.filter((item) => item.defaultCollapsed).map((item) => item.id),
    [items]
  );
  const [order, setOrder] = useState(itemIds);
  const [collapsed, setCollapsed] = useState<string[]>(defaultCollapsed);
  const [hydrated, setHydrated] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [announcement, setAnnouncement] = useState("");

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

  const clearDragState = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const placeCard = (sourceId: string, targetId: string, position: "before" | "after") => {
    if (sourceId === targetId) return;
    setOrder((current) => {
      if (!current.includes(sourceId) || !current.includes(targetId)) return current;
      const next = current.filter((id) => id !== sourceId);
      const targetIndex = next.indexOf(targetId);
      next.splice(targetIndex + (position === "after" ? 1 : 0), 0, sourceId);
      return next;
    });
    const sourceTitle = itemById.get(sourceId)?.title ?? "Card";
    const targetTitle = itemById.get(targetId)?.title ?? "card";
    setAnnouncement(`${sourceTitle} moved ${position} ${targetTitle}.`);
  };

  const moveWithKeyboard = (id: string, direction: -1 | 1) => {
    const index = order.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setOrder(next);
    setAnnouncement(`${itemById.get(id)?.title ?? "Card"} moved ${direction < 0 ? "up" : "down"}.`);
  };

  const handleDragStart = (event: DragEvent<HTMLElement>, id: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
    setDropTarget(null);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!draggingId || draggingId === targetId) {
      setDropTarget(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDropTarget({ id: targetId, position });
  };

  const handleDrop = (event: DragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
    if (sourceId && sourceId !== targetId) {
      const position = dropTarget?.id === targetId ? dropTarget.position : "before";
      placeCard(sourceId, targetId, position);
    }
    clearDragState();
  };

  const handleDragKey = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    moveWithKeyboard(id, event.key === "ArrowUp" ? -1 : 1);
  };

  const toggle = (id: string) => {
    setCollapsed((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  return (
    <div className={className} data-personalizable-card-board>
      <span className="sr-only" id={`${boardId}-drag-help`}>Drag cards to rearrange them. When the drag control has keyboard focus, use the up and down arrow keys to change its position.</span>
      <span className="sr-only" aria-live="polite">{announcement}</span>
      {orderedItems.map((item) => {
        const isCollapsed = collapsed.includes(item.id);
        const titleId = `${boardId}-${item.id}-title`;
        const contentId = `${boardId}-${item.id}-content`;
        const dropClass = dropTarget?.id === item.id ? ` drop-${dropTarget.position}` : "";
        return (
          <section
            className={`card personalizable-card${item.className ? ` ${item.className}` : ""}${draggingId === item.id ? " dragging" : ""}${dropClass}`}
            id={item.id}
            key={item.id}
            data-user-card={item.id}
            aria-labelledby={titleId}
            onDragOver={(event) => handleDragOver(event, item.id)}
            onDrop={(event) => handleDrop(event, item.id)}
          >
            <div className="personalizable-card-header">
              <div className="personalizable-card-heading">
                <h2 id={titleId}>{item.title}</h2>
                {item.description && <p>{item.description}</p>}
              </div>
              <div className="personalizable-card-controls">
                {item.actions}
                <button
                  className="personalizable-card-toggle"
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-controls={contentId}
                  aria-label={`${isCollapsed ? "Expand" : "Minimize"} ${item.title}`}
                  onClick={() => toggle(item.id)}
                >
                  {isCollapsed ? "Expand" : "Minimize"}
                </button>
                <span
                  className="personalizable-card-drag-handle"
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={`Drag ${item.title} to reorder`}
                  aria-describedby={`${boardId}-drag-help`}
                  title="Drag to reorder"
                  onDragStart={(event) => handleDragStart(event, item.id)}
                  onDragEnd={clearDragState}
                  onKeyDown={(event) => handleDragKey(event, item.id)}
                >
                  <span className="desktop-label">Drag to reorder</span>
                  <span className="mobile-label">Drag</span>
                </span>
              </div>
            </div>
            <div id={contentId} className="personalizable-card-content" hidden={isCollapsed}>
              {item.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
