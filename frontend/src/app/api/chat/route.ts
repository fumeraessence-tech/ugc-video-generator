import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: chats, error } = await supabase
    .from("chats")
    .select("id, title, avatar_id, created_at, updated_at, messages(count)")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform to match previous shape: messages(count) returns [{count: N}]
  const transformed = (chats ?? []).map((chat) => ({
    ...chat,
    _count: { messages: chat.messages?.[0]?.count ?? 0 },
    messages: undefined,
  }));

  return NextResponse.json({ chats: transformed });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : null;

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({ user_id: user.id, title })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ chat }, { status: 201 });
}
