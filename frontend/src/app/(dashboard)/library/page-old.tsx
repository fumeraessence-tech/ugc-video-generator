"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Play, Film, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ---------- Types ----------

interface LibraryJob {
  id: string;
  chatId: string;
  script: unknown;
  finalVideoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  chat: {
    title: string | null;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------- Helpers ----------

function getJobTitle(job: LibraryJob): string {
  if (job.chat.title) return job.chat.title;
  if (job.script && typeof job.script === "object" && job.script !== null) {
    const s = job.script as Record<string, unknown>;
    if (typeof s.title === "string") return s.title;
  }
  return `Video ${job.id.slice(0, 8)}`;
}

// ---------- Main Page ----------

export default function LibraryPage() {
  const [jobs, setJobs] = useState<LibraryJob[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<LibraryJob | null>(null);

  const fetchJobs = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/library?page=${p}&limit=12`);
      if (!res.ok) throw new Error("Failed to fetch library");
      const data = await res.json();
      setJobs(data.jobs);
      setPagination(data.pagination);
    } catch {
      toast.error("Failed to load your videos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs(page);
  }, [page, fetchJobs]);

  function handleDownload(url: string, title: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title}.mp4`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <p className="text-sm text-muted-foreground">
          Your completed video creations.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden p-0">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Film className="mb-4 size-16 text-muted-foreground/30" />
          <h2 className="text-lg font-semibold">No videos yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Start creating in Chat! Once your videos are complete, they will
            appear here in your library.
          </p>
          <Button className="mt-6" asChild>
            <a href="/chat">Start Creating</a>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job, i) => {
              const title = getJobTitle(job);
              return (
                <Card
                  key={job.id}
                  className="group cursor-pointer overflow-hidden p-0 transition-shadow hover:shadow-lg"
                  onClick={() => setSelectedJob(job)}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative flex aspect-video items-center justify-center bg-secondary"
                  >
                    <Play className="size-12 text-white/80 transition-transform group-hover:scale-110" />
                    <Badge
                      variant="secondary"
                      className="absolute bottom-2 right-2 bg-black/60 text-white"
                    >
                      Video
                    </Badge>
                  </div>

                  <CardContent className="p-4">
                    <h3 className="truncate font-medium">{title}</h3>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {new Date(job.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      {job.finalVideoUrl && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(job.finalVideoUrl!, title);
                          }}
                        >
                          <Download className="size-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Video Player Dialog */}
      <Dialog
        open={selectedJob !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedJob(null);
        }}
      >
        {selectedJob && (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{getJobTitle(selectedJob)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedJob.finalVideoUrl ? (
                <video
                  src={selectedJob.finalVideoUrl}
                  controls
                  autoPlay
                  className="w-full rounded-lg"
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                  <p className="text-muted-foreground">Video unavailable</p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Created{" "}
                  {new Date(selectedJob.createdAt).toLocaleDateString(
                    undefined,
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    }
                  )}
                </p>
                {selectedJob.finalVideoUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleDownload(
                        selectedJob.finalVideoUrl!,
                        getJobTitle(selectedJob)
                      )
                    }
                  >
                    <Download className="size-4" />
                    Download
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
