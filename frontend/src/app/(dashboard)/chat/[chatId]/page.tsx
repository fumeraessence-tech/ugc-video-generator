import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatContainer } from "@/components/chat/chat-container";
import type { MessageData } from "@/stores/chat-store";

interface PageProps {
  params: Promise<{ chatId: string }>;
}

export default async function ChatDetailPage({ params }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  const { chatId } = await params;

  const { data: chat } = await supabase
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .single();

  if (!chat) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  const serializedMessages: MessageData[] = (messages || []).map((m) => ({
    id: m.id,
    chatId: m.chat_id,
    role: m.role,
    content: m.content,
    metadata: m.metadata as Record<string, unknown> | null,
    createdAt: m.created_at,
  }));

  const serializedChat = {
    id: chat.id,
    title: chat.title,
    createdAt: chat.created_at,
    updatedAt: chat.updated_at,
  };

  return <ChatContainer chat={serializedChat} initialMessages={serializedMessages} />;
}
