import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.script || !body?.storyboard) {
    return NextResponse.json(
      { error: "Script and storyboard are required" },
      { status: 400 }
    );
  }

  // Retrieve the user's Google AI API key
  const userKey = await prisma.userApiKey.findFirst({
    where: {
      userId: session.user.id,
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

  // Forward to Python backend
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${backendUrl}/api/v1/video/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: body.script,
        storyboard: body.storyboard,
        avatar_id: body.avatarId || null,
        avatar_data: body.avatarData || null,
        product_images: body.productImages || [],
        api_key: apiKey,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Backend error" }));
      return NextResponse.json(
        { error: err.detail ?? "Video generation failed" },
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
