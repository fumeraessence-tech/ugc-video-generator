import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { z } from "zod";

const addKeySchema = z.object({
  label: z.string().min(1).max(100),
  service: z.enum(["google_ai", "gcs"]),
  key: z.string().min(1),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: apiKeys, error } = await supabase
    .from("user_api_keys")
    .select("id, label, service, status, last_used_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ apiKeys });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = addKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { label, service, key } = parsed.data;
  const { encrypted: encryptedKey, iv } = encrypt(key);

  const { data: apiKey, error } = await supabase
    .from("user_api_keys")
    .insert({
      user_id: user.id,
      label,
      service,
      encrypted_key: encryptedKey,
      iv,
    })
    .select("id, label, service, status, last_used_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ apiKey }, { status: 201 });
}
