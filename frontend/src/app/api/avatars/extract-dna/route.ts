import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60; // Allow up to 60s for large images + Gemini Vision

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout

    const res = await fetch(`${backendUrl}/api/v1/avatars/extract-dna`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        image_base64: firstImage.data,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Backend error" }));
      console.error("[extract-dna] Backend error:", res.status, err);
      return NextResponse.json(
        { error: err.detail ?? "DNA extraction failed" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ dna: data.dna });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[extract-dna] Error:", message);

    if (message.includes("abort")) {
      return NextResponse.json(
        { error: "DNA extraction timed out. Try with a smaller image." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Failed to connect to backend. Make sure the backend server is running." },
      { status: 502 }
    );
  }
}
