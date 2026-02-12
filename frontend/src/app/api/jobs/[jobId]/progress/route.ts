import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/jobs/[jobId]/progress
 *
 * Webhook endpoint for backend to update job progress in PostgreSQL database.
 * This bridges the gap between backend Redis updates and frontend database.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    const supabase = await createClient();
    const body = await request.json();
    const { status, currentStep, progress, message, data } = body;

    // Check if job exists first
    const { data: existingJob, error: findError } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", jobId)
      .single();

    if (findError || !existingJob) {
      // Job doesn't exist in frontend database - this is OK for direct backend tests
      console.log(`Job ${jobId} not found in database, skipping update`);
      return NextResponse.json({
        success: true,
        skipped: true,
        message: "Job not found in database",
      });
    }

    // Map backend status to job status string
    let mappedStatus: string | undefined = undefined;
    if (status) {
      switch (status.toLowerCase()) {
        case "processing":
          mappedStatus = "running";
          break;
        case "awaiting_approval":
          mappedStatus = "paused";
          break;
        case "queued":
          mappedStatus = "queued";
          break;
        case "completed":
          mappedStatus = "completed";
          break;
        case "failed":
          mappedStatus = "failed";
          break;
        case "cancelled":
          mappedStatus = "cancelled";
          break;
        default:
          mappedStatus = "running"; // Default to running for unknown statuses
      }
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (mappedStatus) updateData.status = mappedStatus;
    if (currentStep) updateData.current_step = currentStep;
    if (typeof progress === "number") updateData.progress = progress;
    if (data?.script) updateData.script = data.script;
    if (data?.storyboard) updateData.storyboard = data.storyboard;
    if (data?.final_video_url) updateData.final_video_url = data.final_video_url;

    // Update job in PostgreSQL database
    const { data: updatedJob, error: updateError } = await supabase
      .from("jobs")
      .update(updateData)
      .eq("id", jobId)
      .select()
      .single();

    if (updateError) {
      console.error(`Failed to update job ${jobId}:`, updateError);
      return NextResponse.json(
        { error: "Failed to update job progress" },
        { status: 500 }
      );
    }

    // Create chat messages for important milestones
    const { data: jobWithChat } = await supabase
      .from("jobs")
      .select("chat_id")
      .eq("id", jobId)
      .single();

    if (jobWithChat?.chat_id) {
      // When storyboard is generated, create a message showing it
      if (currentStep === "storyboard" && data?.storyboard && status !== "failed") {
        // Check if we already created a storyboard message for this job
        const { data: existingStoryboardMsg } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", jobWithChat.chat_id)
          .eq("role", "assistant")
          .contains("metadata", { jobId })
          .limit(1)
          .maybeSingle();

        if (!existingStoryboardMsg) {
          // Transform storyboard data to match frontend format
          // ImageService returns flat array: [{scene_number, image_url, prompt}]
          // StoryboardAgent returns nested: {scenes: [{scene_number, variants: [...]}]}

          let storyboardData: any[] = [];

          if (data.storyboard.scenes && Array.isArray(data.storyboard.scenes)) {
            // StoryboardAgent format - has scenes with variants
            storyboardData = data.storyboard.scenes;
          } else if (Array.isArray(data.storyboard)) {
            // ImageService format - flat array
            storyboardData = data.storyboard;
          }

          const frames = storyboardData.map((scene: any, index: number) => {
            // Extract image URL (handle both formats)
            let imageUrl = "";

            if (scene.variants && Array.isArray(scene.variants) && scene.variants.length > 0) {
              // StoryboardAgent format: scene.variants[].image_url
              const selectedIndex = scene.selected_variant ? scene.selected_variant - 1 : 0;
              const selectedVariant = scene.variants[selectedIndex] || scene.variants[0];
              imageUrl = selectedVariant.image_url || selectedVariant.url || "";
            } else {
              // ImageService format: scene.image_url
              imageUrl = scene.image_url || scene.url || "";
            }

            return {
              id: `${jobId}-scene-${scene.scene_number || scene.sceneNumber || index}`,
              url: imageUrl,
              sceneNumber: parseInt(scene.scene_number || scene.sceneNumber || (index + 1)),
            };
          });

          await supabase.from("messages").insert({
            chat_id: jobWithChat.chat_id,
            role: "assistant",
            content: `✨ Storyboard generated! Here's a preview of your ${frames.length} scene(s):`,
            metadata: {
              type: "storyboard",
              jobId: jobId,
              frames: frames,
            },
          });
        }
      }

      // When video generation completes, create a completion message
      if (status === "completed" && data?.final_video_url) {
        const { data: existingVideoMsg } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", jobWithChat.chat_id)
          .eq("role", "assistant")
          .contains("metadata", { jobId })
          .limit(1)
          .maybeSingle();

        if (!existingVideoMsg) {
          await supabase.from("messages").insert({
            chat_id: jobWithChat.chat_id,
            role: "assistant",
            content: "🎉 Your video is ready!",
            metadata: {
              type: "video",
              jobId: jobId,
              url: data.final_video_url,
            },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      job: updatedJob,
    });
  } catch (error) {
    console.error(`Failed to update job ${jobId}:`, error);
    return NextResponse.json(
      { error: "Failed to update job progress" },
      { status: 500 }
    );
  }
}
