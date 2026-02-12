"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Download, ExternalLink, Image as ImageIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";

interface Storyboard {
  id: string;
  jobId: string;
  sceneNumber: string;
  imageUrl: string;
  prompt?: string;
  chatTitle: string;
  createdAt: string;
}

export default function StoryboardsPage() {
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStoryboard, setSelectedStoryboard] = useState<Storyboard | null>(null);

  useEffect(() => {
    async function fetchStoryboards() {
      try {
        const res = await fetch("/api/library?limit=50");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        // Extract storyboards from jobs
        const extracted: Storyboard[] = data.jobs
          .filter((job: { storyboard: unknown }) => job.storyboard !== null)
          .flatMap((job: { id: string; storyboard: unknown; chat: { title: string | null }; createdAt: string }) => {
            const scenes = job.storyboard as Array<{
              scene_number: string;
              image_url: string;
              prompt?: string;
            }> | null;

            if (!scenes || !Array.isArray(scenes)) return [];

            return scenes.map((scene) => ({
              id: `${job.id}-${scene.scene_number}`,
              jobId: job.id,
              sceneNumber: scene.scene_number,
              imageUrl: scene.image_url,
              prompt: scene.prompt,
              chatTitle: job.chat?.title || "Untitled",
              createdAt: job.createdAt,
            }));
          });

        setStoryboards(extracted);
      } catch {
        toast.error("Failed to load storyboards");
      } finally {
        setLoading(false);
      }
    }

    fetchStoryboards();
  }, []);

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleDownload = (url: string, name: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.png`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Storyboards</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} className="overflow-hidden animate-pulse">
              <div className="aspect-[9/16] bg-muted" />
              <CardContent className="p-2 space-y-1">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Storyboards</h1>
          <p className="text-muted-foreground">
            All generated storyboard images ({storyboards.length} images)
          </p>
        </div>
        <Button asChild>
          <Link href="/generate">
            <Plus className="size-4 mr-2" />
            New Generation
          </Link>
        </Button>
      </div>

      {storyboards.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="size-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <ImageIcon className="size-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              No storyboards generated yet. Start by creating a new video.
            </p>
            <Link
              href="/generate"
              className="mt-4 inline-block text-primary hover:underline"
            >
              Create your first video
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {storyboards.map((storyboard) => (
            <Card
              key={storyboard.id}
              className="overflow-hidden group cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              onClick={() => setSelectedStoryboard(storyboard)}
            >
              <div className="relative aspect-[9/16]">
                <Image
                  src={storyboard.imageUrl}
                  alt={`Scene ${storyboard.sceneNumber}`}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium">
                    View Details
                  </span>
                </div>
              </div>
              <CardContent className="p-2">
                <p className="text-xs font-medium truncate">
                  {storyboard.chatTitle}
                </p>
                <p className="text-xs text-muted-foreground">
                  Scene {storyboard.sceneNumber}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={selectedStoryboard !== null}
        onOpenChange={(open) => !open && setSelectedStoryboard(null)}
      >
        {selectedStoryboard && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedStoryboard.chatTitle} - Scene {selectedStoryboard.sceneNumber}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Image */}
              <div className="relative aspect-[9/16] max-h-[60vh] mx-auto rounded-lg overflow-hidden">
                <Image
                  src={selectedStoryboard.imageUrl}
                  alt={`Scene ${selectedStoryboard.sceneNumber}`}
                  fill
                  className="object-contain"
                />
              </div>

              {/* Prompt */}
              {selectedStoryboard.prompt && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Generation Prompt</h4>
                  <div className="relative">
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {selectedStoryboard.prompt}
                    </pre>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => handleCopyPrompt(selectedStoryboard.prompt!)}
                    >
                      <Copy className="size-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() =>
                    handleDownload(
                      selectedStoryboard.imageUrl,
                      `${selectedStoryboard.chatTitle}-scene-${selectedStoryboard.sceneNumber}`
                    )
                  }
                >
                  <Download className="size-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/library`}>
                    <ExternalLink className="size-4 mr-2" />
                    View Job
                  </Link>
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
