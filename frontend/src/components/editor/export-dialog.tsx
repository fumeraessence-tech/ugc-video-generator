"use client";

import { useState } from "react";
import { useEditorStore } from "@/stores/editor-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2, Check, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const {
    exportSettings,
    setExportSettings,
    exportProgress,
    setExportProgress,
    timelineClips,
    transitions,
    voiceoverClips,
    musicClips,
    captions,
    captionStyle,
    getTotalDuration,
  } = useEditorStore();

  const [isExporting, setIsExporting] = useState(false);
  const totalDuration = getTotalDuration();

  const startExport = async () => {
    setIsExporting(true);
    setExportProgress({ status: "preparing", percent: 0, message: "Preparing export..." });

    try {
      const response = await fetch("/api/editor/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clips: timelineClips.map((c) => ({
            video_url: c.videoUrl,
            trim_start: c.trimStart,
            trim_end: c.trimEnd,
            duration: c.duration,
            scene_number: c.sceneNumber,
          })),
          transitions: transitions.map((t) => ({
            after_clip_index: timelineClips.findIndex(
              (c) => c.id === t.afterClipId
            ),
            type: t.transition.type,
            duration: t.transition.duration,
          })),
          audio: {
            voiceover_clips: voiceoverClips.map((c) => ({
              url: c.url,
              start_time: c.startTime,
              volume: c.volume,
              fade_in: c.fadeIn,
              fade_out: c.fadeOut,
            })),
            music_clips: musicClips.map((c) => ({
              url: c.url,
              start_time: c.startTime,
              volume: c.volume,
              fade_in: c.fadeIn,
              fade_out: c.fadeOut,
            })),
          },
          captions: exportSettings.includeCaptions
            ? {
                items: captions.map((c) => ({
                  text: c.text,
                  start_time: c.startTime,
                  end_time: c.endTime,
                })),
                style: captionStyle,
                burn_in: exportSettings.captionBurnIn,
              }
            : null,
          settings: {
            resolution: exportSettings.resolution,
            format: exportSettings.format,
            quality: exportSettings.quality,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Export failed");
      }

      const data = await response.json();
      const jobId = data.job_id;

      // Poll for progress
      setExportProgress({ status: "rendering", percent: 10, message: "Rendering video..." });

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/editor/compile/${jobId}/status`);
          if (!statusRes.ok) return;

          const status = await statusRes.json();

          setExportProgress({
            status: status.status,
            percent: status.percent,
            message: status.message,
            outputUrl: status.output_url,
          });

          if (status.status === "complete" || status.status === "error") {
            clearInterval(pollInterval);
            setIsExporting(false);
          }
        } catch {
          // Continue polling
        }
      }, 2000);
    } catch (error) {
      setExportProgress({
        status: "error",
        percent: 0,
        message: error instanceof Error ? error.message : "Export failed",
        error: error instanceof Error ? error.message : "Export failed",
      });
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Video</DialogTitle>
          <DialogDescription>
            Compile your timeline into a final video. Duration: {totalDuration.toFixed(1)}s
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Settings */}
          {exportProgress.status === "idle" && (
            <>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Resolution</Label>
                  <Select
                    value={exportSettings.resolution}
                    onValueChange={(v: "720p" | "1080p" | "4k") =>
                      setExportSettings({ resolution: v })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">720p (HD)</SelectItem>
                      <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                      <SelectItem value="4k">4K (Ultra HD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Format</Label>
                  <Select
                    value={exportSettings.format}
                    onValueChange={(v: "mp4" | "webm") =>
                      setExportSettings({ format: v })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mp4">MP4 (H.264)</SelectItem>
                      <SelectItem value="webm">WebM (VP9)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Quality</Label>
                  <Select
                    value={exportSettings.quality}
                    onValueChange={(v: "draft" | "standard" | "high") =>
                      setExportSettings({ quality: v })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft (Fast)</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="high">High Quality</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Include Audio</Label>
                  <Switch
                    checked={exportSettings.includeAudio}
                    onCheckedChange={(v: boolean) =>
                      setExportSettings({ includeAudio: v })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Include Captions</Label>
                  <Switch
                    checked={exportSettings.includeCaptions}
                    onCheckedChange={(v: boolean) =>
                      setExportSettings({ includeCaptions: v })
                    }
                  />
                </div>
                {exportSettings.includeCaptions && (
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Burn-in Captions</Label>
                    <Switch
                      checked={exportSettings.captionBurnIn}
                      onCheckedChange={(v: boolean) =>
                        setExportSettings({ captionBurnIn: v })
                      }
                    />
                  </div>
                )}
              </div>

              <Button
                onClick={startExport}
                className="w-full gap-2"
                disabled={timelineClips.length === 0}
              >
                <Download className="size-4" />
                Start Export
              </Button>
            </>
          )}

          {/* Progress */}
          {exportProgress.status !== "idle" &&
            exportProgress.status !== "complete" &&
            exportProgress.status !== "error" && (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">
                    {exportProgress.message}
                  </span>
                </div>
                <Progress value={exportProgress.percent} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {exportProgress.percent}% complete
                </p>
              </div>
            )}

          {/* Complete */}
          {exportProgress.status === "complete" && (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto size-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="size-6 text-green-500" />
              </div>
              <div>
                <h4 className="font-semibold">Export Complete!</h4>
                <p className="text-sm text-muted-foreground">
                  Your video is ready to download.
                </p>
              </div>
              {exportProgress.outputUrl && (
                <Button asChild className="w-full gap-2">
                  <a href={exportProgress.outputUrl} download>
                    <Download className="size-4" />
                    Download Video
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setExportProgress({
                    status: "idle",
                    percent: 0,
                    message: "",
                  });
                }}
              >
                Export Again
              </Button>
            </div>
          )}

          {/* Error */}
          {exportProgress.status === "error" && (
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>
                  {exportProgress.error || "Export failed. Please try again."}
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setExportProgress({
                    status: "idle",
                    percent: 0,
                    message: "",
                  });
                }}
              >
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
