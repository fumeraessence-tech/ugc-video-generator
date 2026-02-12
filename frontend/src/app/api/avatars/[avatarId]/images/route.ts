import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const addImageSchema = z.object({
  imageUrl: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ avatarId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { avatarId } = await params;

  try {
    const { data: avatar, error: fetchError } = await supabase
      .from("avatars")
      .select("*")
      .eq("id", avatarId)
      .single();

    if (fetchError || !avatar) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }

    // TODO: Restrict to super admin for system avatars in future
    if (!avatar.is_system && avatar.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = addImageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    }

    const { imageUrl } = parsed.data;
    const currentImages: string[] = avatar.reference_images || [];

    // Don't add duplicates
    if (currentImages.includes(imageUrl)) {
      return NextResponse.json(avatar);
    }

    const { data: updatedAvatar, error } = await supabase
      .from("avatars")
      .update({
        reference_images: [...currentImages, imageUrl],
        // Set as thumbnail if none exists
        thumbnail_url: avatar.thumbnail_url || imageUrl,
      })
      .eq("id", avatarId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(updatedAvatar);
  } catch (error) {
    console.error("Failed to add image to avatar:", error);
    return NextResponse.json({ error: "Failed to add image" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ avatarId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { avatarId } = await params;

  try {
    // Find the avatar
    const { data: avatar, error: fetchError } = await supabase
      .from("avatars")
      .select("*")
      .eq("id", avatarId)
      .single();

    if (fetchError || !avatar) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }

    // Check ownership (unless it's a system avatar, which can't be modified)
    // TODO: Restrict to super admin for system avatars in future
    if (!avatar.is_system && avatar.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the image URL to delete
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { imageUrl } = body as { imageUrl?: string };

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { error: "imageUrl is required" },
        { status: 400 }
      );
    }

    // Remove the image from the reference_images array
    const currentImages: string[] = avatar.reference_images || [];
    const updatedImages = currentImages.filter((img: string) => img !== imageUrl);

    // Update the avatar
    const { data: updatedAvatar, error } = await supabase
      .from("avatars")
      .update({
        reference_images: updatedImages,
      })
      .eq("id", avatarId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(updatedAvatar);
  } catch (error) {
    console.error("Failed to delete image from avatar:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
