import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const patchSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  status: z.enum(["active", "revoked"]).optional(),
}).refine((data) => data.label !== undefined || data.status !== undefined, {
  message: "At least one field (label or status) must be provided",
});

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { keyId } = await params;

  // RLS auto-filters by user_id
  const { data: apiKey, error: findError } = await supabase
    .from("user_api_keys")
    .select("user_id")
    .eq("id", keyId)
    .single();

  if (findError || !apiKey) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  if (apiKey.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: deleteError } = await supabase
    .from("user_api_keys")
    .delete()
    .eq("id", keyId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { keyId } = await params;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verify ownership
  const { data: apiKey, error: findError } = await supabase
    .from("user_api_keys")
    .select("user_id")
    .eq("id", keyId)
    .single();

  if (findError || !apiKey) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  if (apiKey.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) updateData.label = parsed.data.label;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

  const { data: updated, error: updateError } = await supabase
    .from("user_api_keys")
    .update(updateData)
    .eq("id", keyId)
    .select("id, label, service, status, last_used_at, created_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ apiKey: updated });
}
