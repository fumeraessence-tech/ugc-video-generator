import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/jobs/[jobId]/update-artifacts
 *
 * Webhook endpoint for the backend pipeline to persist per-step artifacts.
 * Called after each pipeline step completes to durably store results.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    const supabase = await createClient();
    const body = await request.json();
    const { step, artifacts } = body;

    if (!step || !artifacts) {
      return NextResponse.json(
        { error: "step and artifacts are required" },
        { status: 400 }
      );
    }

    const { data: existingJob, error: findError } = await supabase
      .from("jobs")
      .select("id, step_artifacts")
      .eq("id", jobId)
      .single();

    if (findError || !existingJob) {
      return NextResponse.json(
        { success: true, skipped: true, message: "Job not found in database" }
      );
    }

    // Merge new step artifacts with existing ones
    const currentArtifacts = (existingJob.step_artifacts as Record<string, unknown>) || {};
    const updatedArtifacts = { ...currentArtifacts, [step]: artifacts };

    // Build the update payload based on the step
    const updateData: Record<string, unknown> = {
      step_artifacts: updatedArtifacts,
      last_completed_step: step,
    };

    // Also update specific Job fields for quick access
    if (step === "script_generation" && artifacts.script) {
      updateData.script = artifacts.script;
    }
    if (step === "storyboard" && artifacts.storyboard) {
      updateData.storyboard = artifacts.storyboard;
    }
    if (step === "storyboard" && artifacts.consistencyScores) {
      updateData.consistency_scores = artifacts.consistencyScores;
    }
    if (step === "video_generation" && artifacts.videoScenes) {
      updateData.video_scenes = artifacts.videoScenes;
    }
    if (step === "audio" && artifacts.audioUrl) {
      updateData.audio_url = artifacts.audioUrl;
    }
    if (step === "assembly" && artifacts.finalVideoUrl) {
      updateData.final_video_url = artifacts.finalVideoUrl;
    }

    // Store avatar/generation data if provided (for re-opens)
    if (artifacts.avatarDNA) {
      updateData.avatar_dna = artifacts.avatarDNA;
    }
    if (artifacts.avatarRefImages) {
      updateData.avatar_ref_images = artifacts.avatarRefImages;
    }
    if (artifacts.generationSettings) {
      updateData.generation_settings = artifacts.generationSettings;
    }

    const { error: updateError } = await supabase
      .from("jobs")
      .update(updateData)
      .eq("id", jobId);

    if (updateError) {
      console.error(`Failed to update artifacts for job ${jobId}:`, updateError);
      return NextResponse.json(
        { error: "Failed to update job artifacts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, step, jobId });
  } catch (error) {
    console.error(`Failed to update artifacts for job ${jobId}:`, error);
    return NextResponse.json(
      { error: "Failed to update job artifacts" },
      { status: 500 }
    );
  }
}
