"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import {
  Download, Play, Film, Loader2, ChevronLeft, ChevronRight,
  Package, Trash2, Plus, Search, MessageSquare, RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { SceneBreakdown } from "@/components/library/scene-breakdown";

// ---------- Types ----------

type StatusFilter = "all" | "completed" | "running" | "failed" | "queued";

interface LibraryJob {
  id: string;
  chatId: string;
  status: string;
  currentStep: string | null;
  progress: number;
  script: unknown;
  storyboard: unknown;
  videoScenes: unknown;
  audioUrl: string | null;
  finalVideoUrl: string | null;
  productName: string | null;
  productImages: string[];
  backgroundSetting: string | null;
  platform: string | null;
  consistencyScores: unknown;
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
  if (job.productName) return job.productName;
  if (job.chat.title) return job.chat.title;
  if (job.script && typeof job.script === "object" && job.script !== null) {
    const s = job.script as Record<string, unknown>;
    if (typeof s.title === "string") return s.title;
  }
  return `Video ${job.id.slice(0, 8)}`;
}

function getStatusColor(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toLowerCase()) {
    case "completed":
      return "default"; // Green/success color
    case "running":
    case "processing":
      return "secondary"; // Blue color
    case "queued":
    case "pending":
      return "outline"; // Yellow/warning color
    case "failed":
    case "error":
      return "destructive"; // Red color
    default:
      return "secondary";
  }
}

function formatBackgroundSetting(setting: string | null): string {
  if (!setting) return "";
  return setting
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatPlatform(platform: string | null): string {
  if (!platform) return "";
  return platform
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ---------- Main Page ----------

export default function LibraryPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<LibraryJob[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<LibraryJob | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Client-side filtering
  const filteredJobs = useMemo(() => {
    let filtered = jobs;
    if (statusFilter !== "all") {
      filtered = filtered.filter((j) => {
        const s = j.status.toLowerCase();
        if (statusFilter === "running") return s === "running" || s === "processing";
        if (statusFilter === "queued") return s === "queued" || s === "pending" || s === "paused";
        return s === statusFilter;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((j) => {
        const title = getJobTitle(j).toLowerCase();
        const product = (j.productName || "").toLowerCase();
        return title.includes(q) || product.includes(q);
      });
    }
    return filtered;
  }, [jobs, statusFilter, searchQuery]);

  function handleContinueInChat(job: LibraryJob) {
    router.push(`/chat/${job.chatId}`);
  }

  async function handleRegenerate(job: LibraryJob) {
    try {
      const res = await fetch(`/api/jobs/${job.id}/reopen`);
      if (!res.ok) throw new Error("Failed to load job data");
      // Navigate to chat to start a new generation with same settings
      router.push(`/chat/${job.chatId}`);
    } catch {
      toast.error("Failed to re-open job");
    }
  }

  function getAvgConsistencyScore(job: LibraryJob): number | null {
    if (!job.consistencyScores || !Array.isArray(job.consistencyScores)) return null;
    const scores = job.consistencyScores as Array<{ score: number }>;
    if (scores.length === 0) return null;
    return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  }

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

  async function handleDeleteJob(jobId: string, e: React.MouseEvent) {
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this job? This action cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/library/${jobId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete job");

      toast.success("Job deleted successfully");

      // Close dialog if this job was selected
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }

      // Refresh the job list
      fetchJobs(page);
    } catch (error) {
      toast.error("Failed to delete job");
      console.error("Delete error:", error);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            Your video creations and generation jobs.
          </p>
        </div>
        <Button asChild>
          <Link href="/generate">
            <Plus className="size-4 mr-2" />
            New Generation
          </Link>
        </Button>
      </div>

      {/* Filter tabs + search */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex gap-1 rounded-lg border p-1">
          {(["all", "completed", "running", "failed", "queued"] as StatusFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === filter
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              onClick={() => setStatusFilter(filter)}
            >
              {filter === "all" ? "All" : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
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
      ) : filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Film className="mb-4 size-16 text-muted-foreground/30" />
          <h2 className="text-lg font-semibold">No videos yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Start creating in Chat! Once your videos are generated, they will
            appear here in your library.
          </p>
          <Button className="mt-6" asChild>
            <a href="/chat">Start Creating</a>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredJobs.map((job) => {
              const title = getJobTitle(job);
              const isCompleted = job.status.toLowerCase() === "completed";
              const isRunning = job.status.toLowerCase() === "running" || job.status.toLowerCase() === "processing";
              const isPaused = job.status.toLowerCase() === "paused";
              const isFailed = job.status.toLowerCase() === "failed";
              const thumbnailUrl = job.productImages?.[0];
              const avgScore = getAvgConsistencyScore(job);

              return (
                <Card
                  key={job.id}
                  className="group cursor-pointer overflow-hidden p-0 transition-shadow hover:shadow-lg"
                  onClick={() => setSelectedJob(job)}
                >
                  {/* Thumbnail */}
                  <div className="relative flex aspect-video items-center justify-center bg-secondary">
                    {thumbnailUrl ? (
                      <img
                        src={thumbnailUrl}
                        alt={title}
                        className="size-full object-cover"
                      />
                    ) : (
                      <Play className="size-12 text-white/80 transition-transform group-hover:scale-110" />
                    )}
                    <Badge
                      variant={getStatusColor(job.status)}
                      className="absolute top-2 right-2"
                    >
                      {job.status}
                    </Badge>
                    {job.productName && (
                      <Badge
                        variant="secondary"
                        className="absolute bottom-2 left-2 bg-black/60 text-white"
                      >
                        <Package className="mr-1 size-3" />
                        Product
                      </Badge>
                    )}
                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 left-2 size-8 bg-black/60 opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                      onClick={(e) => handleDeleteJob(job.id, e)}
                    >
                      <Trash2 className="size-4 text-white" />
                    </Button>
                  </div>

                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <h3 className="truncate font-medium">{title}</h3>

                      {/* Progress bar for running jobs */}
                      {isRunning && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{job.currentStep || "Processing"}</span>
                            <span>{job.progress}%</span>
                          </div>
                          <Progress value={job.progress} className="h-1" />
                        </div>
                      )}

                      {/* Metadata row */}
                      {/* Consistency score */}
                      {avgScore !== null && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Consistency:</span>
                          <Badge
                            variant={avgScore >= 0.85 ? "default" : avgScore >= 0.75 ? "secondary" : "destructive"}
                            className="text-[10px] h-4 px-1"
                          >
                            {Math.round(avgScore * 100)}%
                          </Badge>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex flex-col gap-0.5">
                          {job.platform && (
                            <span>{formatPlatform(job.platform)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span>
                            {new Date(job.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          {job.finalVideoUrl && isCompleted && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(job.finalVideoUrl!, title);
                              }}
                            >
                              <Download className="size-3" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Continue / Re-generate buttons */}
                      {(isPaused || isRunning || isFailed) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContinueInChat(job);
                          }}
                        >
                          <MessageSquare className="size-3 mr-1" />
                          Continue in Chat
                        </Button>
                      )}
                      {isCompleted && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRegenerate(job);
                          }}
                        >
                          <RotateCcw className="size-3 mr-1" />
                          Re-generate
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
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {getJobTitle(selectedJob)}
                <Badge variant={getStatusColor(selectedJob.status)}>
                  {selectedJob.status}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="preview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="scenes">Scenes</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>

              {/* Preview Tab */}
              <TabsContent value="preview" className="space-y-4">
              {/* Product Images */}
              {selectedJob.productImages && selectedJob.productImages.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Product Images</h4>
                  <div className="flex gap-2 overflow-x-auto">
                    {selectedJob.productImages.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`Product ${idx + 1}`}
                        className="size-20 rounded-lg object-cover"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Video Player */}
              {selectedJob.finalVideoUrl ? (
                <video
                  src={selectedJob.finalVideoUrl}
                  controls
                  autoPlay
                  className="w-full rounded-lg"
                >
                  Your browser does not support the video tag.
                </video>
              ) : selectedJob.status.toLowerCase() === "running" || selectedJob.status.toLowerCase() === "processing" ? (
                <div className="flex aspect-video flex-col items-center justify-center gap-4 rounded-lg bg-muted">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium text-muted-foreground">
                      {selectedJob.currentStep || "Processing"}
                    </p>
                    <Progress value={selectedJob.progress} className="mt-2 h-1.5 w-48" />
                    <p className="mt-1 text-xs text-muted-foreground">{selectedJob.progress}%</p>
                  </div>
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                  <p className="text-muted-foreground">
                    {selectedJob.status.toLowerCase() === "queued"
                      ? "Video generation queued"
                      : "Video unavailable"}
                  </p>
                </div>
              )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4">
                  {selectedJob.finalVideoUrl && selectedJob.status.toLowerCase() === "completed" && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleDownload(
                          selectedJob.finalVideoUrl!,
                          getJobTitle(selectedJob)
                        )
                      }
                    >
                      <Download className="mr-2 size-4" />
                      Download Video
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => handleContinueInChat(selectedJob)}
                  >
                    <MessageSquare className="mr-2 size-4" />
                    Continue in Chat
                  </Button>
                  {selectedJob.status.toLowerCase() === "completed" && (
                    <Button
                      variant="outline"
                      onClick={() => handleRegenerate(selectedJob)}
                    >
                      <RotateCcw className="mr-2 size-4" />
                      Re-generate
                    </Button>
                  )}
                </div>
              </TabsContent>

              {/* Scenes Tab */}
              <TabsContent value="scenes" className="space-y-4">
                <SceneBreakdown
                  script={selectedJob.script as any}
                  storyboard={selectedJob.storyboard as any}
                  audioClips={selectedJob.videoScenes as any}
                />
              </TabsContent>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-4">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {selectedJob.platform && (
                    <div>
                      <span className="text-muted-foreground">Platform:</span>
                      <p className="font-medium">{formatPlatform(selectedJob.platform)}</p>
                    </div>
                  )}
                  {selectedJob.backgroundSetting && (
                    <div>
                      <span className="text-muted-foreground">Background:</span>
                      <p className="font-medium">{formatBackgroundSetting(selectedJob.backgroundSetting)}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <p className="font-medium">
                      {new Date(selectedJob.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Updated:</span>
                    <p className="font-medium">
                      {new Date(selectedJob.updatedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Job ID:</span>
                    <p className="font-mono text-xs">{selectedJob.id}</p>
                  </div>
                </div>

                {/* Delete Button */}
                <div className="flex justify-start pt-4">
                  <Button
                    variant="outline"
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={(e) => handleDeleteJob(selectedJob.id, e)}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete Job
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
