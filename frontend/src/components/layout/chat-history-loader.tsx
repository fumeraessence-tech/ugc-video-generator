"use client";

import { useEffect } from "react";
import { useSidebar } from "@/hooks/use-sidebar";

export function ChatHistoryLoader() {
  const setChatHistory = useSidebar((s) => s.setChatHistory);

  useEffect(() => {
    async function loadChatHistory() {
      try {
        const res = await fetch("/api/chat");
        if (!res.ok) return;

        const data = await res.json();
        if (data.chats && Array.isArray(data.chats)) {
          setChatHistory(
            data.chats.map((chat: any) => ({
              id: chat.id,
              title: chat.title || "Untitled Chat",
              updatedAt: new Date(chat.updatedAt),
            }))
          );
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
      }
    }

    loadChatHistory();
  }, [setChatHistory]);

  return null;
}
