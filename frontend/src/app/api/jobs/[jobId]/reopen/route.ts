import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/jobs/[jobId]/reopen
 *
 * Returns all the data needed to re-open a job in the chat context,
 * restoring generation settings, script, storyboard, and last step.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, chat_id, user_id, status, current_step, last_completed_step, script, storyboard, video_scenes, final_video_url, avatar_id, avatar_dna, avatar_ref_images, generation_settings, consistency_scores, product_name, product_images, background_setting, platform, metadata")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  return NextResponse.json({
    jobId: job.id,
    chatId: job.chat_id,
    status: job.status,
    currentStep: job.current_step,
    lastCompletedStep: job.last_completed_step,
    script: job.script,
    storyboard: job.storyboard,
    videoScenes: job.video_scenes,
    finalVideoUrl: job.final_video_url,
    avatarId: job.avatar_id,
    avatarDNA: job.avatar_dna,
    avatarRefImages: job.avatar_ref_images,
    generationSettings: job.generation_settings,
    consistencyScores: job.consistency_scores,
    productName: job.product_name,
    productImages: job.product_images,
    backgroundSetting: job.background_setting,
    platform: job.platform,
  });
}
