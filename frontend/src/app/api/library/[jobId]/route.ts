import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  // RLS auto-filters by user_id, so if the job doesn't belong to the user, it won't be found
  const { data: job, error: findError } = await supabase
    .from("jobs")
    .select("user_id")
    .eq("id", jobId)
    .single();

  if (findError || !job) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete job
  const { error: deleteError } = await supabase
    .from("jobs")
    .delete()
    .eq("id", jobId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
