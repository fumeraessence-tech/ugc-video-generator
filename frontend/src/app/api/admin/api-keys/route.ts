import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "super_admin") return null;
  return user;
}

export async function GET() {
  const supabase = await createClient();
  const admin = await requireSuperAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: keys, error } = await supabase
    .from("api_pool_keys")
    .select("id, service, status, last_used_at, error_count, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ apiKeys: keys });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = await requireSuperAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { service, encrypted_key, iv } = body;

  if (!service || !encrypted_key || !iv) {
    return NextResponse.json(
      { error: "Missing required fields: service, encrypted_key, iv" },
      { status: 400 }
    );
  }

  const { data: key, error } = await supabase
    .from("api_pool_keys")
    .insert({ service, encrypted_key, iv })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ apiKey: key }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const admin = await requireSuperAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get("id");

  if (!keyId) {
    return NextResponse.json({ error: "Missing key id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("api_pool_keys")
    .delete()
    .eq("id", keyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
