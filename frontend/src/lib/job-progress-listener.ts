/**
 * Utility to listen to backend job progress updates via SSE and
 * create chat messages when important milestones are reached (e.g., storyboard).
 *
 * Note: This runs client-side, so it uses fetch to create messages via API routes
 * instead of direct database access.
 */

interface ProgressUpdate {
  job_id: string;
  status: string;
  current_step: string;
  progress: number;
  message: string;
  data?: {
    storyboard?: any;
    script?: any;
    final_video_url?: string;
  };
}

export async function listenToJobProgress(
  jobId: string,
  chatId: string,
  onProgress?: (update: ProgressUpdate) => void
): Promise<void> {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
  const eventSource = new EventSource(`${backendUrl}/api/v1/jobs/${jobId}/stream`);

  eventSource.addEventListener("progress", async (event) => {
    try {
      const update: ProgressUpdate = JSON.parse(event.data);

      // Call optional callback
      if (onProgress) {
        onProgress(update);
      }

      // Create chat messages for important milestones
      if (update.current_step === "storyboard" && update.data?.storyboard) {
        // Create a storyboard message in the chat via API
        await fetch(`/api/chat/${chatId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "assistant",
            content: "Here's your storyboard preview:",
            metadata: {
              type: "storyboard",
              frames: update.data.storyboard.scenes || [],
            },
          }),
        });
      }

      // Close connection when job is complete or failed
      if (update.status === "completed" || update.status === "failed") {
        eventSource.close();
      }
    } catch (error) {
      console.error("Error processing progress update:", error);
    }
  });

  eventSource.addEventListener("error", (error) => {
    console.error("SSE connection error:", error);
    eventSource.close();
  });
}
