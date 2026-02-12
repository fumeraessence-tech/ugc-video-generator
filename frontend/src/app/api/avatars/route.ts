import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const createAvatarSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  tag: z.string().max(100).optional(),
  dna: z.record(z.string(), z.unknown()),
  thumbnailUrl: z.string().optional(),
  referenceSheet: z.string().optional(),
  referenceImages: z.array(z.string()).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: avatars, error } = await supabase
      .from("avatars")
      .select("*")
      .or("is_system.eq.true,user_id.eq." + user.id)
      .order("is_system", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(avatars);
  } catch (error) {
    console.error("Failed to fetch avatars:", error);
    return NextResponse.json({ error: "Failed to fetch avatars" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const parsed = createAvatarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, tag, dna, thumbnailUrl, referenceSheet, referenceImages } = parsed.data;

  try {
    const { data: avatar, error } = await supabase
      .from("avatars")
      .insert({
        name,
        tag: tag ?? null,
        dna,
        is_system: false,
        thumbnail_url: thumbnailUrl ?? (referenceImages?.[0] ?? null),
        reference_sheet: referenceSheet ?? null,
        reference_images: referenceImages ?? [],
        user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(avatar, { status: 201 });
  } catch (error) {
    console.error("Failed to create avatar:", error);
    return NextResponse.json({ error: "Failed to create avatar" }, { status: 500 });
  }
}
