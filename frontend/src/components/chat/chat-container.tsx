"use client";

import { useEffect, useCallback, useRef } from "react";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChatStore, type MessageData } from "@/stores/chat-store";
import type { AttachmentFile } from "@/components/chat/attachment-preview";

interface ChatData {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatContainerProps {
  chat: ChatData;
  initialMessages: MessageData[];
}

export function ChatContainer({ chat, initialMessages }: ChatContainerProps) {
  const {
    messages,
    isStreaming,
    setActiveChatId,
    setMessages,
    addMessage,
    setStreaming,
    setStreamingContent,
    appendStreamingContent,
    resetStreaming,
    setError,
    clearError,
  } = useChatStore();

  // Refs to avoid stale closures in polling interval
  const isStreamingRef = useRef(isStreaming);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Initialize store with server data
  useEffect(() => {
    setActiveChatId(chat.id);
    setMessages(initialMessages);
    return () => {
      setActiveChatId(null);
      setMessages([]);
      resetStreaming();
      // Abort any in-flight stream on unmount
      abortControllerRef.current?.abort();
    };
  }, [chat.id, initialMessages, setActiveChatId, setMessages, resetStreaming]);

  // Poll for new messages — skip during active stream
  useEffect(() => {
    const pollMessages = async () => {
      // Don't poll while streaming — prevents overwriting streaming state
      if (isStreamingRef.current) return;

      try {
        const res = await fetch(`/api/chat/${chat.id}/messages`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages && Array.isArray(data.messages)) {
            setMessages(data.messages);
          }
        }
      } catch {
        // Silent poll failure — non-critical
      }
    };

    const interval = setInterval(pollMessages, 3000);
    return () => clearInterval(interval);
  }, [chat.id, setMessages]);

  // Exposed abort function for "Stop generating" button
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    resetStreaming();
  }, [resetStreaming]);

  const handleSend = useCallback(
    async (content: string, attachments?: AttachmentFile[]) => {
      if (isStreaming) return;

      clearError();
      setStreaming(true);
      setStreamingContent("");

      // Abort any leftover controller
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Upload attachments if any
        let attachmentUrls: string[] = [];
        if (attachments && attachments.length > 0) {
          const formData = new FormData();
          for (const att of attachments) {
            formData.append("files", att.file);
          }
          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            attachmentUrls = uploadData.urls ?? [];
          }
        }

        const store = useChatStore.getState();
        const settings = store.getGenerationSettings();

        const response = await fetch(`/api/chat/${chat.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            settings,
            attachments: attachmentUrls.length > 0 ? attachmentUrls : undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Server error (${response.status})`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            const jsonStr = trimmed.slice(6);
            let event: {
              type: string;
              message?: MessageData;
              content?: string;
              error?: string;
            };
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            switch (event.type) {
              case "user_message":
                if (event.message) {
                  addMessage(event.message);
                }
                break;
              case "stream":
                if (event.content) {
                  appendStreamingContent(event.content);
                }
                break;
              case "assistant_message":
                if (event.message) {
                  resetStreaming();
                  addMessage(event.message);
                }
                break;
              case "error":
                setError(event.error || "An error occurred", content);
                resetStreaming();
                break;
              case "done":
                break;
            }
          }
        }
      } catch (error) {
        // AbortError is intentional (user clicked Stop) — don't show error
        if (error instanceof DOMException && error.name === "AbortError") {
          resetStreaming();
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to send message";
        setError(message, content);
      } finally {
        setStreaming(false);
        setStreamingContent("");

        // Post-stream poll to catch webhook-injected messages
        if (!controller.signal.aborted) {
          try {
            const res = await fetch(`/api/chat/${chat.id}/messages`);
            if (res.ok) {
              const data = await res.json();
              if (data.messages && Array.isArray(data.messages)) {
                setMessages(data.messages);
              }
            }
          } catch {
            // Non-critical
          }
        }
      }
    },
    [
      chat.id,
      isStreaming,
      setStreaming,
      setStreamingContent,
      addMessage,
      appendStreamingContent,
      resetStreaming,
      setError,
      clearError,
      setMessages,
    ]
  );

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages} onStop={handleStop} />
      <ChatInput onSend={handleSend} isStreaming={isStreaming} />
    </div>
  );
}
