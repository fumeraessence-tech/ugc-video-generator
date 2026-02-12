import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  // Fetch ALL jobs (not just completed) so users can see in-progress ones
  // RLS auto-filters by user_id
  const [jobsResult, countResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, chat_id, status, current_step, progress, script, storyboard, video_scenes, audio_url, final_video_url, product_name, product_images, background_setting, platform, created_at, updated_at, chats(title)")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("jobs")
      .select("*", { count: "exact", head: true }),
  ]);

  if (jobsResult.error) {
    return NextResponse.json({ error: jobsResult.error.message }, { status: 500 });
  }

  const total = countResult.count ?? 0;

  return NextResponse.json({
    jobs: jobsResult.data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
