"use client";

import { useCallback, useEffect, useRef } from "react";
import { AlertCircle, Loader2, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageBubble } from "@/components/chat/message-bubble";
import { useChatStore, type MessageData } from "@/stores/chat-store";

interface MessageListProps {
  messages: MessageData[];
  isLoading?: boolean;
  onStop?: () => void;
}

function MessageSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-2">
      <Skeleton className="size-6 shrink-0 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

export function MessageList({ messages, isLoading, onStop }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const prevMessageCount = useRef(messages.length);

  const { isStreaming, streamingContent, error, clearError } = useChatStore();

  // ---- Smart Auto-Scroll ----

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    isNearBottom.current = scrollHeight - scrollTop - clientHeight < 150;
  }, []);

  // Force scroll when a new user message appears (messages array grows and last message is "user")
  useEffect(() => {
    const currentCount = messages.length;
    if (
      currentCount > prevMessageCount.current &&
      messages[currentCount - 1]?.role === "user"
    ) {
      // Force scroll for user's own message
      scrollToBottom("instant");
    }
    prevMessageCount.current = currentCount;
  }, [messages, scrollToBottom]);

  // Auto-scroll on streaming content updates only if user is near the bottom
  useEffect(() => {
    if (isNearBottom.current) {
      scrollToBottom();
    }
  }, [streamingContent, isStreaming, scrollToBottom]);

  // ---- Loading state ----

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 py-6">
          <MessageSkeleton />
          <MessageSkeleton />
          <MessageSkeleton />
        </div>
      </div>
    );
  }

  // ---- Main render ----

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      <div className="mx-auto max-w-3xl space-y-1 py-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Streaming message in progress */}
        {isStreaming && streamingContent && (
          <MessageBubble
            message={{
              id: "streaming",
              chatId: "",
              role: "assistant",
              content: streamingContent,
              metadata: null,
              createdAt: new Date().toISOString(),
            }}
            isStreaming
          />
        )}

        {/* Typing indicator when streaming but no content yet */}
        {isStreaming && !streamingContent && (
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Loader2 className="size-3.5 animate-spin text-secondary-foreground" />
            </div>
            <div className="flex items-center gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {/* Stop generating button */}
        {isStreaming && onStop && (
          <div className="flex justify-center px-4 py-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              className="gap-2 text-muted-foreground"
            >
              <Square className="size-3 fill-current" />
              Stop generating
            </Button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mx-4 my-2 flex items-start gap-3 rounded-lg bg-destructive/10 border border-destructive/20 p-4">
            <AlertCircle className="size-5 shrink-0 text-destructive mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">
                Something went wrong
              </p>
              <p className="mt-1 text-sm text-destructive/90">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearError}
              className="shrink-0 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <X className="size-4" />
              Dismiss
            </Button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
