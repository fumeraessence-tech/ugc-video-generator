"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface AvatarData {
  id: string;
  name: string;
  tag: string | null;
  isSystem: boolean;
  thumbnailUrl: string | null;
  referenceSheet: string | null;
  referenceImages: string[];
  dna: Record<string, unknown>;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Deterministic color from name
function getAvatarColor(name: string): string {
  const colors = [
    "bg-neutral-600",
    "bg-neutral-700",
    "bg-neutral-500",
    "bg-zinc-600",
    "bg-zinc-700",
    "bg-stone-600",
    "bg-stone-700",
    "bg-gray-600",
    "bg-gray-700",
    "bg-neutral-800",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface AvatarCardProps {
  avatar: AvatarData;
  onClick?: () => void;
  onDelete?: (id: string) => void;
  onReextract?: (avatar: AvatarData) => void;
}

export function AvatarCard({ avatar, onClick, onDelete, onReextract }: AvatarCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [reextracting, setReextracting] = useState(false);

  const gender = (avatar.dna?.gender as string) || "";
  const ethnicity = (avatar.dna?.ethnicity as string) || "";

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete avatar "${avatar.name}"?`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/avatars/${avatar.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Avatar deleted");
      onDelete?.(avatar.id);
    } catch {
      toast.error("Failed to delete avatar");
    } finally {
      setDeleting(false);
    }
  };

  const handleReextract = async (e: React.MouseEvent) => {
    e.stopPropagation();

    const images = avatar.referenceImages || [];
    if (images.length === 0 && !avatar.thumbnailUrl) {
      toast.error("No images to extract DNA from");
      return;
    }

    setReextracting(true);
    try {
      // Get the first image to extract DNA
      const imageUrl = images[0] || avatar.thumbnailUrl;

      // Fetch and convert to base64
      const response = await fetch(imageUrl!);
      const blob = await response.blob();
      const reader = new FileReader();
      const imageBase64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.readAsDataURL(blob);
      });

      // Extract DNA
      const res = await fetch("/api/avatars/extract-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: [{ data: imageBase64, mime_type: "image/jpeg" }],
        }),
      });

      if (!res.ok) throw new Error("DNA extraction failed");

      const { dna: extractedDna } = await res.json();

      // Update avatar with new DNA
      const updateRes = await fetch(`/api/avatars/${avatar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dna: extractedDna }),
      });

      if (!updateRes.ok) throw new Error("Failed to update avatar");

      const updatedAvatar = await updateRes.json();
      toast.success("DNA re-extracted successfully");
      onReextract?.(updatedAvatar);
    } catch (err) {
      toast.error("Failed to re-extract DNA");
    } finally {
      setReextracting(false);
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer overflow-hidden transition-all duration-200 group",
        "hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30"
      )}
      onClick={onClick}
    >
      <CardContent className="p-0">
        {/* Image - full width, no padding */}
        <div className="relative aspect-[3/4] w-full overflow-hidden">
          {avatar.thumbnailUrl ? (
            <img
              src={avatar.thumbnailUrl}
              alt={avatar.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className={cn(
                "flex h-full w-full items-center justify-center",
                getAvatarColor(avatar.name)
              )}
            >
              <span className="text-3xl font-bold text-white/90">
                {getInitials(avatar.name)}
              </span>
            </div>
          )}

          {/* Overlay info at bottom */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-3 pt-8">
            <h3 className="font-semibold text-white text-sm truncate">
              {avatar.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {gender && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-white/20 text-white border-0">
                  {gender}
                </Badge>
              )}
              {ethnicity && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-white/20 text-white border-0">
                  {ethnicity}
                </Badge>
              )}
            </div>
          </div>

          {/* System badge */}
          {avatar.isSystem && (
            <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] shadow-sm">
              System
            </Badge>
          )}

          {/* Action buttons - show on hover */}
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!avatar.isSystem && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-7 bg-white/90 hover:bg-white shadow-sm"
                  onClick={handleReextract}
                  disabled={reextracting}
                >
                  {reextracting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-7 bg-white/90 hover:bg-destructive hover:text-white shadow-sm"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
