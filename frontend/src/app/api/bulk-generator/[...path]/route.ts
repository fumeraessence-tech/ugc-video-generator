import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

/**
 * Catch-all proxy route for Bulk Generator backend endpoints.
 * Routes: upload-reference, upload-csv, generate-stream, download-zip
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const subPath = path.join("/");
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  const targetUrl = `${backendUrl}/api/v1/bulk-generator/${subPath}`;

  // Get user's API key for Gemini
  const { data: userKey } = await supabase
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
      // Fall through - backend will use its own key
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const contentType = request.headers.get("content-type") || "";

  try {
    // Handle file uploads (multipart/form-data)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const backendRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: formData,
      });

      if (!backendRes.ok) {
        const err = await backendRes.json().catch(() => ({ detail: "Backend error" }));
        return NextResponse.json(
          { error: err.detail ?? "Upload failed" },
          { status: backendRes.status }
        );
      }

      const data = await backendRes.json();
      return NextResponse.json(data);
    }

    // Handle SSE streaming for generate-stream
    if (subPath === "generate-stream") {
      const body = await request.json().catch(() => ({}));
      const backendRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          ...body,
          api_key: apiKey,
        }),
      });

      if (!backendRes.ok || !backendRes.body) {
        const err = await backendRes.json().catch(() => ({ detail: "Backend error" }));
        return new Response(JSON.stringify({ error: err.detail }), {
          status: backendRes.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(backendRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        },
      });
    }

    // Handle ZIP download
    if (subPath === "download-zip") {
      const body = await request.json().catch(() => ({}));
      const backendRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify(body),
      });

      if (!backendRes.ok) {
        const err = await backendRes.json().catch(() => ({ detail: "Download failed" }));
        return NextResponse.json(
          { error: err.detail ?? "Download failed" },
          { status: backendRes.status }
        );
      }

      const blob = await backendRes.blob();
      return new Response(blob, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition":
            backendRes.headers.get("Content-Disposition") ??
            'attachment; filename="bulk-images.zip"',
        },
      });
    }

    // Handle JSON requests
    const body = await request.json().catch(() => ({}));
    const backendRes = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({
        ...body,
        api_key: apiKey,
      }),
    });

    if (!backendRes.ok) {
      const err = await backendRes.json().catch(() => ({ detail: "Backend error" }));
      return NextResponse.json(
        { error: err.detail ?? "Request failed" },
        { status: backendRes.status }
      );
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to backend." },
      { status: 502 }
    );
  }
}
