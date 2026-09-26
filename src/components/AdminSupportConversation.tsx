"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function AdminSupportConversation({ children, latestMessageId }: { children: ReactNode; latestMessageId?: string }) {
  const thread = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const region = thread.current;
    if (region) region.scrollTop = region.scrollHeight;
  }, [latestMessageId]);
  return <div ref={thread} className="support-thread" role="region" aria-label="Conversation messages" tabIndex={0}>{children}</div>;
}
