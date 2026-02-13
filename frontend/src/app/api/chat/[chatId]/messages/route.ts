import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { GoogleGenAI } from "@google/genai";

type RouteContext = { params: Promise<{ chatId: string }> };

function buildSystemPrompt(settings: Record<string, unknown> | undefined): string {
  const lines: string[] = [
    "You are UGCGen, an expert AI assistant specializing in UGC (User Generated Content) video production.",
    "You help users create professional video scripts, storyboards, and detailed scene descriptions.",
    "Always respond with actionable, production-ready content.",
    "",
    "When a user describes a video scene, you should:",
    "1. Break it into a detailed, production-ready script with scene-by-scene directions",
    "2. Include specific camera angles, movements, and framing instructions",
    "3. Specify lighting setup, color temperature, and mood",
    "4. Describe talent/avatar actions, expressions, and dialogue with timing",
    "5. Include audio notes (ambient sound, music, voiceover tone)",
    "6. Provide post-production notes (color grading, transitions, text overlays)",
    "",
  ];

  if (settings && Object.keys(settings).length > 0) {
    lines.push("## Current Generation Settings");

    if (settings.mode) lines.push(`- Generation Mode: ${settings.mode}`);
    if (settings.aspectRatio) lines.push(`- Aspect Ratio: ${settings.aspectRatio}`);
    if (settings.duration) lines.push(`- Duration: ${settings.duration}s`);

    const models = settings.models as Record<string, string> | undefined;
    if (models) {
      lines.push(`- Script Model: ${models.script ?? "gemini-2.5-pro"}`);
      lines.push(`- Video Model: ${models.video ?? "veo-3.1"}`);
    }

    const camera = settings.camera as Record<string, string> | undefined;
    if (camera) {
      if (camera.shotType) lines.push(`- Shot Type: ${camera.shotType}`);
      if (camera.angle) lines.push(`- Camera Angle: ${camera.angle}`);
      if (camera.movement) lines.push(`- Camera Movement: ${camera.movement}`);
      if (camera.depthOfField) lines.push(`- Depth of Field: ${camera.depthOfField}`);
    }

    const lighting = settings.lighting as Record<string, string> | undefined;
    if (lighting) {
      if (lighting.type) lines.push(`- Lighting Type: ${lighting.type}`);
      if (lighting.direction) lines.push(`- Light Direction: ${lighting.direction}`);
      if (lighting.colorTemp) lines.push(`- Color Temperature: ${lighting.colorTemp}`);
      if (lighting.intensity) lines.push(`- Lighting Intensity: ${lighting.intensity}`);
    }

    if (settings.videoStyle) lines.push(`- Video Style: ${settings.videoStyle}`);
    if (settings.platform) lines.push(`- Platform: ${settings.platform}`);
    if (settings.resolution) lines.push(`- Resolution: ${settings.resolution}`);
    if (settings.colorGrading) lines.push(`- Color Grading: ${settings.colorGrading}`);
    if (settings.audioEnabled !== undefined) lines.push(`- Audio: ${settings.audioEnabled ? "Enabled" : "Disabled"}`);

    const realism = settings.realismFilters as Record<string, boolean> | undefined;
    if (realism) {
      const active: string[] = [];
      if (realism.lensDistortion) active.push("Lens Distortion");
      if (realism.filmGrain) active.push("Film Grain");
      if (realism.motionBlur) active.push("Motion Blur");
      if (active.length > 0) lines.push(`- Realism Filters: ${active.join(", ")}`);
    }

    lines.push("");
    lines.push("Incorporate ALL of the above settings into your response. Tailor your script and scene descriptions to match the specified camera, lighting, aspect ratio, duration, and style.");
  }

  return lines.join("\n");
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId } = await context.params;

  // Verify chat ownership (RLS also enforces this)
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("user_id")
    .eq("id", chatId)
    .single();

  if (chatError || !chat || chat.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

  let query = supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  // Cursor-based pagination: fetch messages created before the cursor message
  if (cursor) {
    // Look up the cursor message's created_at to paginate
    const { data: cursorMsg } = await supabase
      .from("messages")
      .select("created_at")
      .eq("id", cursor)
      .single();

    if (cursorMsg) {
      query = query.lt("created_at", cursorMsg.created_at);
    }
  }

  const { data: messages, error: msgError } = await query;

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  const rows = messages ?? [];
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  return NextResponse.json({
    messages: rows.reverse(),
    nextCursor: hasMore ? rows[0]?.id : null,
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId } = await context.params;

  // Verify chat ownership
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("user_id, title")
    .eq("id", chatId)
    .single();

  if (chatError || !chat || chat.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const { content: rawContent, settings, attachments } = body as {
    content: string;
    settings?: Record<string, unknown>;
    attachments?: string[];
  };
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  const validAttachments = Array.isArray(attachments) ? attachments.filter((a): a is string => typeof a === "string") : [];

  // Allow sending with attachments only (no text required)
  if (!content && validAttachments.length === 0) {
    return NextResponse.json(
      { error: "Message content or attachments required" },
      { status: 400 }
    );
  }

  // Save the user message
  const { data: userMessage, error: userMsgError } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      role: "user",
      content,
      metadata: {
        ...(settings ? settings : {}),
        ...(validAttachments.length > 0 ? { attachments: validAttachments } : {}),
      },
    })
    .select()
    .single();

  if (userMsgError || !userMessage) {
    return NextResponse.json({ error: userMsgError?.message ?? "Failed to save message" }, { status: 500 });
  }

  // Auto-title the chat from the first message if untitled
  if (!chat.title) {
    const titleText = content
      ? (content.length > 60 ? content.substring(0, 60) + "..." : content)
      : `Uploaded ${validAttachments.length} image(s)`;
    await supabase
      .from("chats")
      .update({ title: titleText })
      .eq("id", chatId);
  }

  await supabase
    .from("chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", chatId);

  // Retrieve the user's Google AI API key
  const { data: userKey } = await supabase
    .from("user_api_keys")
    .select("encrypted_key, iv")
    .eq("user_id", user.id)
    .eq("service", "google_ai")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let apiKey: string | null = null;
  if (userKey) {
    try {
      apiKey = decrypt(userKey.encrypted_key, userKey.iv);
    } catch {
      // Key decryption failed
    }
  }

  // Load conversation history for context
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .neq("id", userMessage.id)
    .order("created_at", { ascending: true })
    .limit(20);

  const systemPrompt = buildSystemPrompt(settings);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send user message event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "user_message", message: userMessage })}\n\n`
          )
        );

        let fullResponse = "";

        if (!apiKey) {
          // No API key — return helpful error
          fullResponse =
            "No Google AI API key found. Please go to **Settings > API Keys** and add your Google AI API key to start generating content. You can get one from [Google AI Studio](https://aistudio.google.com/apikey).";

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "stream", content: fullResponse })}\n\n`
            )
          );
        } else {
          // Detect intent: Does user want video generation or just chat?
          const ai = new GoogleGenAI({ apiKey });

          // Three-way intent detection: VIDEO_READY, VIDEO_NEEDS_INPUT, CHAT
          const hasAvatar = !!(settings?.selectedAvatarId || (Array.isArray(settings?.avatarReferenceImages) && settings.avatarReferenceImages.length > 0));
          const hasProductImages = Array.isArray(settings?.productImages) && settings.productImages.length > 0;
          const hasProductName = !!settings?.productName;
          const avatarAngleCount = settings?.avatarAngleCoverage ? Object.keys(settings.avatarAngleCoverage).length : 0;

          const messageDescription = content || `[User uploaded ${validAttachments.length} image(s) without text]`;

          const intentPrompt = `Analyze the user's message and context to determine their intent.
User message: "${messageDescription}"
Generation mode: ${settings?.mode ?? "ingredients"}
Has avatar selected: ${hasAvatar ? "yes" : "no"}
Has avatar reference images: ${Array.isArray(settings?.avatarReferenceImages) ? settings.avatarReferenceImages.length : 0}
Avatar angle coverage: ${avatarAngleCount} angles
Has product images: ${hasProductImages ? "yes" : "no"}
Has product name: ${hasProductName ? "yes" : "no"}
Has attachments: ${body.attachments?.length > 0 ? "yes" : "no"}

Reply with ONLY one of these:
- "VIDEO_READY" if they want to create/generate a video AND have enough context (avatar or character description + clear video description)
- "VIDEO_NEEDS_INPUT" if they seem to want a video but are missing key information (no character/avatar, vague description, mentions product but no product images)
- "CHAT" if it's a general question, conversation, or request for help`;

          let intent: "VIDEO_READY" | "VIDEO_NEEDS_INPUT" | "CHAT" = "CHAT";
          try {
            const intentResponse = await Promise.race([
              ai.models.generateContent({
                model: "gemini-2.5-flash",
                config: { temperature: 0 },
                contents: [{ role: "user", parts: [{ text: intentPrompt }] }],
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Intent detection timed out")), 5000)
              ),
            ]);

            const rawIntent = intentResponse.text?.trim().toUpperCase() || "CHAT";
            console.log("[Intent Detection] Raw:", rawIntent);
            intent =
              rawIntent === "VIDEO_READY" ? "VIDEO_READY"
              : rawIntent === "VIDEO_NEEDS_INPUT" ? "VIDEO_NEEDS_INPUT"
              : "CHAT";
          } catch (intentError) {
            console.warn("[Intent Detection] Failed, defaulting to CHAT:", intentError instanceof Error ? intentError.message : intentError);
            intent = "CHAT";
          }

          if (intent === "VIDEO_NEEDS_INPUT") {
            // Generate proactive guidance asking for what's missing
            const guidancePrompt = `You are UGCGen, a helpful video production assistant. The user wants to create a video but is missing some information. Based on the context below, generate a friendly, concise response asking for what's needed.

User message: "${content}"
Has avatar/character: ${hasAvatar ? "yes" : "no"}
Has avatar references: ${Array.isArray(settings?.avatarReferenceImages) ? settings.avatarReferenceImages.length + " images" : "none"}
Avatar angle coverage: ${avatarAngleCount}/3 required angles
Has product images: ${hasProductImages ? "yes" : "no"}
Has product name: ${hasProductName ? settings.productName : "not set"}

Guide the user to provide what's missing. Be specific and actionable. Keep it under 100 words.`;

            const guidanceResponse = await ai.models.generateContentStream({
              model: "gemini-2.5-flash",
              config: { temperature: 0.7, maxOutputTokens: 300 },
              contents: [{ role: "user", parts: [{ text: guidancePrompt }] }],
            });

            for await (const chunk of guidanceResponse) {
              const text = chunk.text ?? "";
              if (text) {
                fullResponse += text;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "stream", content: text })}\n\n`
                  )
                );
              }
            }
          } else if (intent === "VIDEO_READY") {
            // User wants video generation - call backend pipeline
            fullResponse = "🎬 Starting video generation pipeline...\n\nI'll create a professional script, generate storyboard images, and produce your UGC video. This may take a few minutes.\n\n**Step 1:** Generating script with Gemini 2.5 Pro...";

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "stream", content: fullResponse })}\n\n`
              )
            );

            // Create Job in database
            const { data: job, error: jobError } = await supabase
              .from("jobs")
              .insert({
                chat_id: chatId,
                user_id: user.id,
                avatar_id: (typeof settings?.selectedAvatarId === "string" ? settings.selectedAvatarId : null),
                status: "queued",
                current_step: "script_generation",
                progress: 0,
                metadata: settings ?? {},
                // New production fields
                product_name: typeof settings?.productName === "string" ? settings.productName : null,
                product_images: Array.isArray(settings?.productImages) ? settings.productImages : [],
                background_setting: typeof settings?.backgroundSetting === "string" ? settings.backgroundSetting : "modern_bedroom",
                platform: typeof settings?.platform === "string" ? settings.platform : "instagram_reels",
                max_scene_duration: typeof settings?.duration === "number" && settings.duration <= 8 ? settings.duration : 8,
                words_per_minute: 150, // Natural Indian English pace
              })
              .select()
              .single();

            if (jobError || !job) {
              fullResponse += `\n\n❌ Error: Failed to create job`;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "stream", content: "\n\n❌ Failed to create job" })}\n\n`
                )
              );
            } else {
              // Call backend generation API with frontend job ID
              try {
                const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
                const genResponse = await fetch(`${backendUrl}/api/v1/generate`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    job_id: job.id,  // Send frontend job ID to backend
                    prompt: content,
                    avatar_id: settings?.selectedAvatarId || null,
                    avatar_dna: settings?.avatarDNA || null,  // Avatar DNA for character consistency
                    avatar_reference_images: Array.isArray(settings?.avatarReferenceImages) ? settings.avatarReferenceImages : [],  // Avatar images for storyboard base
                    product_name: typeof settings?.productName === "string" ? settings.productName : null,
                    product_images: Array.isArray(settings?.productImages) ? settings.productImages : [],
                    product_dna: settings?.productDNA || null,
                    background_setting: typeof settings?.backgroundSetting === "string" ? settings.backgroundSetting : "modern_bedroom",
                    platform: typeof settings?.platform === "string" ? settings.platform : "instagram_reels",
                    style: settings?.videoStyle || "professional",
                    duration: settings?.duration || 30,
                    aspect_ratio: settings?.aspectRatio || "9:16",
                    max_scene_duration: typeof settings?.maxSceneDuration === "number" ? settings.maxSceneDuration : 8,
                    words_per_minute: 150,
                    attachment_urls: validAttachments,
                  }),
                });

                if (!genResponse.ok) {
                  throw new Error("Backend generation failed");
                }

                const genData = await genResponse.json();

                fullResponse += `\n\n✅ Job created: ${job.id}\n\nYou can track progress in the Library tab.`;

                // Log job details for debugging
                console.log("Job created with details:", {
                  jobId: job.id,
                  productName: job.product_name,
                  productImages: job.product_images?.length || 0,
                  backgroundSetting: job.background_setting,
                  platform: job.platform,
                });
              } catch (error) {
                fullResponse += `\n\n❌ Error: ${error instanceof Error ? error.message : "Failed to start generation"}`;
              }

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "stream", content: "\n\n✅ Video generation started!" })}\n\n`
                )
              );
            }
          } else {
            // Regular chat - stream response
            const geminiHistory = (history ?? []).map((m) => ({
              role: m.role === "assistant" ? "model" as const : "user" as const,
              parts: [{ text: m.content }],
            }));

            const response = await ai.models.generateContentStream({
              model: "gemini-2.5-flash",
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.8,
                maxOutputTokens: 4096,
              },
              contents: [
                ...geminiHistory,
                { role: "user", parts: [{ text: messageDescription }] },
              ],
            });

            for await (const chunk of response) {
              const text = chunk.text ?? "";
              if (text) {
                fullResponse += text;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "stream", content: text })}\n\n`
                  )
                );
              }
            }
          }
        }

        // Save the complete assistant message
        const { data: assistantMessage } = await supabase
          .from("messages")
          .insert({
            chat_id: chatId,
            role: "assistant",
            content: fullResponse,
          })
          .select()
          .single();

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "assistant_message", message: assistantMessage })}\n\n`
          )
        );

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
