"use client";

import { useState, useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Music,
  Upload,
  Play,
  Pause,
  Plus,
  Trash2,
  Volume2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MusicTrack as MusicTrackType } from "@/types/editor";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "upbeat", label: "Upbeat" },
  { id: "calm", label: "Calm" },
  { id: "dramatic", label: "Dramatic" },
  { id: "corporate", label: "Corporate" },
  { id: "fun", label: "Fun" },
  { id: "ambient", label: "Ambient" },
];

export function MusicPanel() {
  const {
    musicClips,
    addAudioClip,
    removeAudioClip,
    updateAudioClip,
    getTotalDuration,
  } = useEditorStore();

  const [libraryTracks, setLibraryTracks] = useState<MusicTrackType[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [previewingTrack, setPreviewingTrack] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalDuration = getTotalDuration();

  // Fetch music library
  useEffect(() => {
    const fetchLibrary = async () => {
      setIsLoading(true);
      try {
        const url =
          selectedCategory === "all"
            ? "/api/editor/music-library"
            : `/api/editor/music-library?category=${selectedCategory}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setLibraryTracks(
            data.map((t: MusicTrackType) => ({ ...t, isPreset: true }))
          );
        }
      } catch (error) {
        console.error("Failed to fetch music library:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLibrary();
  }, [selectedCategory]);

  const addTrackToTimeline = (track: MusicTrackType) => {
    addAudioClip({
      id: `music-${track.id}-${Date.now()}`,
      type: "music",
      url: track.url,
      filename: `${track.name}.mp3`,
      duration: track.duration,
      volume: 60,
      startTime: 0,
      trimStart: 0,
      trimEnd: Math.max(0, track.duration - totalDuration),
      fadeIn: 1.0,
      fadeOut: 2.0,
      label: track.name,
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/editor/upload-music", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();

      addAudioClip({
        id: data.id,
        type: "music",
        url: data.url,
        filename: data.name,
        duration: data.duration,
        volume: 60,
        startTime: 0,
        trimStart: 0,
        trimEnd: Math.max(0, data.duration - totalDuration),
        fadeIn: 1.0,
        fadeOut: 2.0,
        label: data.name,
      });
    } catch (error) {
      console.error("Music upload failed:", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <h3 className="font-semibold text-sm">Background Music</h3>

      {/* Current music on timeline */}
      {musicClips.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-medium">On Timeline</Label>
          {musicClips.map((clip) => (
            <div
              key={clip.id}
              className="rounded-lg border p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium truncate flex-1">
                  {clip.label}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => removeAudioClip(clip.id)}
                >
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Volume2 className="size-3 text-muted-foreground" />
                  <Slider
                    value={[clip.volume]}
                    onValueChange={([v]) =>
                      updateAudioClip(clip.id, { volume: v })
                    }
                    min={0}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-[10px] text-muted-foreground w-6 text-right">
                    {clip.volume}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Fade In: {clip.fadeIn.toFixed(1)}s
                    </Label>
                    <Slider
                      value={[clip.fadeIn]}
                      onValueChange={([v]) =>
                        updateAudioClip(clip.id, { fadeIn: v })
                      }
                      min={0}
                      max={5}
                      step={0.5}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Fade Out: {clip.fadeOut.toFixed(1)}s
                    </Label>
                    <Slider
                      value={[clip.fadeOut]}
                      onValueChange={([v]) =>
                        updateAudioClip(clip.id, { fadeOut: v })
                      }
                      min={0}
                      max={5}
                      step={0.5}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload custom */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Upload Custom Music</Label>
        <div className="flex gap-2">
          <Input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="text-xs"
            onChange={handleUpload}
            disabled={isUploading}
          />
          {isUploading && <Loader2 className="size-4 animate-spin" />}
        </div>
      </div>

      {/* Music Library */}
      <div className="space-y-3">
        <Label className="text-xs font-medium">Music Library</Label>

        {/* Category filters */}
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <Badge
              key={cat.id}
              variant={selectedCategory === cat.id ? "default" : "outline"}
              className="cursor-pointer text-[10px]"
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </Badge>
          ))}
        </div>

        {/* Track list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {libraryTracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center gap-2 rounded-lg border p-2 hover:bg-muted/50 transition-colors"
              >
                <Music className="size-3.5 text-green-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">
                    {track.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {track.artist} &middot; {track.duration}s
                    {track.bpm && ` &middot; ${track.bpm} BPM`}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => addTrackToTimeline(track)}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            ))}
            {libraryTracks.length === 0 && !isLoading && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No tracks in this category
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
