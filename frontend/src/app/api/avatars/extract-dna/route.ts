import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.images || !Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json(
      { error: "At least one image is required" },
      { status: 400 }
    );
  }

  // Validate first image has required data field
  const firstImage = body.images[0];
  if (!firstImage || typeof firstImage.data !== "string" || !firstImage.data) {
    return NextResponse.json(
      { error: "Image data is required and must be a base64 string" },
      { status: 400 }
    );
  }

  // Forward to Python backend (uses server-configured API key)
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  try {
    // Transform images array to the format expected by backend
    // Backend expects: { image_base64: "..." } or { image_url: "..." }
    // Frontend sends: { images: [{ data: "base64...", mime_type: "..." }] }
    const res = await fetch(`${backendUrl}/api/v1/avatars/extract-dna`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: firstImage.data,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Backend error" }));
      return NextResponse.json(
        { error: err.detail ?? "DNA extraction failed" },
        { status: res.status }
      );
    }

    const data = await res.json();
    // Backend returns { dna: { face: ..., skin: ..., ... } }
    return NextResponse.json({ dna: data.dna });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to backend. Make sure the backend server is running." },
      { status: 502 }
    );
  }
}
