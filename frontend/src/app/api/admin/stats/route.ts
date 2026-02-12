import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch counts using Supabase head: true for count-only queries
  const [usersResult, jobsResult, avatarsResult, chatsResult] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("jobs").select("*", { count: "exact", head: true }),
    supabase.from("avatars").select("*", { count: "exact", head: true }),
    supabase.from("chats").select("*", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    stats: {
      totalUsers: usersResult.count ?? 0,
      totalJobs: jobsResult.count ?? 0,
      totalAvatars: avatarsResult.count ?? 0,
      totalChats: chatsResult.count ?? 0,
    },
  });
}
