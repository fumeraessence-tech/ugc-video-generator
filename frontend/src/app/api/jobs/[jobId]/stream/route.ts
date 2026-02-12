import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint for real-time job progress updates.
 * Returns a stream of job status changes until completion or failure.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { jobId } = await params;

  // Verify job exists and user has access
  // Fetch the job along with its chat to verify ownership
  const { data: job, error } = await supabase
    .from("jobs")
    .select("*, chats(*)")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return new Response("Job not found", { status: 404 });
  }

  if (job.chats?.user_id !== user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let pollCount = 0;
      const maxPolls = 600; // 10 minutes max (600 * 1 second)

      const sendEvent = (data: unknown) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send initial job state
      sendEvent({
        id: job.id,
        status: job.status,
        progress: job.progress,
        metadata: job.metadata,
        errorMessage: job.error_message,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      });

      const interval = setInterval(async () => {
        try {
          pollCount++;

          // Fetch latest job state
          const { data: currentJob, error: pollError } = await supabase
            .from("jobs")
            .select("*")
            .eq("id", jobId)
            .single();

          if (pollError || !currentJob) {
            clearInterval(interval);
            controller.close();
            return;
          }

          // Send job update
          sendEvent({
            id: currentJob.id,
            status: currentJob.status,
            progress: currentJob.progress,
            metadata: currentJob.metadata,
            errorMessage: currentJob.error_message,
            createdAt: currentJob.created_at,
            updatedAt: currentJob.updated_at,
          });

          // Close stream if job is complete or failed
          if (
            currentJob.status === "completed" ||
            currentJob.status === "failed" ||
            currentJob.status === "cancelled"
          ) {
            clearInterval(interval);
            controller.close();
            return;
          }

          // Timeout after max polls
          if (pollCount >= maxPolls) {
            clearInterval(interval);
            sendEvent({
              error: "Job polling timeout - maximum wait time exceeded",
            });
            controller.close();
            return;
          }
        } catch (error) {
          clearInterval(interval);
          console.error("SSE polling error:", error);
          sendEvent({
            error: "Internal server error during job polling",
          });
          controller.close();
        }
      }, 1000); // Poll every 1 second

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
