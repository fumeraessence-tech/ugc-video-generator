import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.script) {
    return NextResponse.json(
      { error: "Script is required" },
      { status: 400 }
    );
  }

  // Retrieve the user's Google AI API key
  const { data: userKey, error: keyError } = await supabase
    .from("user_api_keys")
    .select("*")
    .eq("service", "google_ai")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let apiKey: string | undefined;
  if (userKey) {
    try {
      apiKey = decrypt(userKey.encrypted_key, userKey.iv);
    } catch {
      return NextResponse.json(
        { error: "Failed to decrypt API key." },
        { status: 500 }
      );
    }
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "No Google AI API key found." },
      { status: 403 }
    );
  }

  // Extract avatar reference images from avatar data if available
  const avatarReferenceImages: string[] = [];
  if (body.avatarData?.referenceImages && Array.isArray(body.avatarData.referenceImages)) {
    avatarReferenceImages.push(...body.avatarData.referenceImages);
  }
  // Also check for thumbnailUrl as fallback reference
  if (body.avatarData?.thumbnailUrl && avatarReferenceImages.length === 0) {
    avatarReferenceImages.push(body.avatarData.thumbnailUrl);
  }

  // Forward to Python backend
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${backendUrl}/api/v1/storyboard/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: body.script,
        avatar_id: body.avatarId || null,
        avatar_data: body.avatarData || null,
        avatar_reference_images: avatarReferenceImages,
        product_images: body.productImages || [],
        product_name: body.productName || null,
        product_dna: body.product_dna || body.productDna || null,
        api_key: apiKey,
        aspect_ratio: body.aspectRatio || "9:16",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Backend error" }));
      return NextResponse.json(
        { error: err.detail ?? "Storyboard generation failed" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to backend." },
      { status: 502 }
    );
  }
}
