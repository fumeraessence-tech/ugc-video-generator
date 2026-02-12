import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const updateAvatarSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  tag: z.string().max(100).optional(),
  dna: z.record(z.string(), z.unknown()).optional(),
  thumbnailUrl: z.string().nullable().optional(),
  referenceSheet: z.string().nullable().optional(),
  referenceImages: z.array(z.string()).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ avatarId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { avatarId } = await params;

  try {
    const { data: avatar, error } = await supabase
      .from("avatars")
      .select("*")
      .eq("id", avatarId)
      .single();

    if (error || !avatar) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }

    // Only allow access to system avatars or user's own avatars
    if (!avatar.is_system && avatar.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(avatar);
  } catch (error) {
    console.error("Failed to fetch avatar:", error);
    return NextResponse.json({ error: "Failed to fetch avatar" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ avatarId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { avatarId } = await params;

  const { data: avatar, error: fetchError } = await supabase
    .from("avatars")
    .select("*")
    .eq("id", avatarId)
    .single();

  if (fetchError || !avatar) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }

  // TODO: Restrict to super admin in future
  // For now, allow any logged-in user to delete system avatars
  if (!avatar.is_system && avatar.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { error } = await supabase
      .from("avatars")
      .delete()
      .eq("id", avatarId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete avatar:", error);
    return NextResponse.json({ error: "Failed to delete avatar" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ avatarId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { avatarId } = await params;

  const { data: avatar, error: fetchError } = await supabase
    .from("avatars")
    .select("*")
    .eq("id", avatarId)
    .single();

  if (fetchError || !avatar) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }

  // TODO: Restrict to super admin in future
  // For now, allow any logged-in user to update system avatars
  if (!avatar.is_system && avatar.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = updateAvatarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, tag, dna, thumbnailUrl, referenceSheet, referenceImages } = parsed.data;

  // Build snake_case update payload
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (tag !== undefined) updateData.tag = tag;
  if (dna !== undefined) updateData.dna = dna;
  if (thumbnailUrl !== undefined) updateData.thumbnail_url = thumbnailUrl;
  if (referenceSheet !== undefined) updateData.reference_sheet = referenceSheet;
  if (referenceImages !== undefined) updateData.reference_images = referenceImages;

  try {
    const { data: updated, error } = await supabase
      .from("avatars")
      .update(updateData)
      .eq("id", avatarId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update avatar:", error);
    return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 });
  }
}
