import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.prompt) {
    return NextResponse.json(
      { error: "Prompt is required" },
      { status: 400 }
    );
  }

  // Retrieve the user's Google AI API key
  const userKey = await prisma.userApiKey.findFirst({
    where: {
      userId: user.id,
      service: "google_ai",
      status: "active",
    },
    orderBy: { createdAt: "desc" },
  });

  let apiKey: string | undefined;
  if (userKey) {
    try {
      apiKey = decrypt(userKey.encryptedKey, userKey.iv);
    } catch {
      return NextResponse.json(
        { error: "Failed to decrypt API key. Please re-add your Google AI key in Settings." },
        { status: 500 }
      );
    }
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "No Google AI API key found. Please add your API key in Settings." },
      { status: 403 }
    );
  }

  // Forward to Python backend
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${backendUrl}/api/v1/copilot/generate-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: body.prompt,
        product_name: body.productName || null,
        background_setting: body.backgroundSetting || "modern_bedroom",
        platform: body.platform || "instagram_reels",
        duration: body.duration || 30,
        max_scene_duration: body.maxSceneDuration || 8,
        words_per_minute: body.wordsPerMinute || 150,
        api_key: apiKey,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Backend error" }));
      return NextResponse.json(
        { error: err.detail ?? "Script generation failed" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to backend. Make sure the backend server is running." },
      { status: 502 }
    );
  }
}
