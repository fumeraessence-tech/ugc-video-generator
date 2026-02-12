"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trash2,
  ExternalLink,
  X,
  Pencil,
  Save,
  Plus,
  Sparkles,
  Loader2,
  ImagePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AvatarData } from "./avatar-card";
import { toast } from "sonner";

const DNA_KEYS = [
  "gender",
  "ethnicity",
  "age_range",
  "face",
  "skin",
  "eyes",
  "hair",
  "body",
  "voice",
  "wardrobe",
  "prohibited_drift",
];

function getAvatarColor(name: string): string {
  const colors = [
    "bg-neutral-600",
    "bg-neutral-700",
    "bg-neutral-500",
    "bg-zinc-600",
    "bg-zinc-700",
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

interface AvatarDetailDialogProps {
  avatar: AvatarData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (avatarId: string) => void;
  onUpdate?: (avatar: AvatarData) => void;
}

export function AvatarDetailDialog({
  avatar,
  open,
  onOpenChange,
  onDelete,
  onUpdate,
}: AvatarDetailDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTag, setEditTag] = useState("");
  const [editDna, setEditDna] = useState<Record<string, string>>({});

  // Loading states
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingImage, setDeletingImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [extracting, setExtracting] = useState(false);

  if (!avatar) return null;

  const dna = (avatar.dna ?? {}) as Record<string, unknown>;

  const startEditing = () => {
    setEditName(avatar.name);
    setEditTag(avatar.tag || "");
    const dnaRecord: Record<string, string> = {};
    DNA_KEYS.forEach((key) => {
      dnaRecord[key] = String(dna[key] || "");
    });
    setEditDna(dnaRecord);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/avatars/${avatar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          tag: editTag.trim() || null,
          dna: editDna,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update avatar");
      }

      const updated = await res.json();
      onUpdate?.(updated);
      setEditing(false);
      toast.success("Avatar updated");
    } catch {
      toast.error("Failed to update avatar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this avatar?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/avatars/${avatar.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete?.(avatar.id);
        onOpenChange(false);
        toast.success("Avatar deleted");
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast.error(errorData.error || "Failed to delete avatar");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete avatar";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteImage = async (imageUrl: string) => {
    setDeletingImage(imageUrl);
    try {
      const res = await fetch(`/api/avatars/${avatar.id}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });

      if (res.ok) {
        const updatedAvatar = await res.json();
        onUpdate?.(updatedAvatar);
        toast.success("Image deleted");
      } else {
        toast.error("Failed to delete image");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeletingImage(null);
    }
  };

  const handleAddImage = async (file: File) => {
    setUploadingImage(true);
    try {
      // Upload file first
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/avatars/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Upload failed");
      }

      const { imageUrl } = await uploadRes.json();

      // Add to avatar
      const addRes = await fetch(`/api/avatars/${avatar.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });

      if (addRes.ok) {
        const updatedAvatar = await addRes.json();
        onUpdate?.(updatedAvatar);
        toast.success("Image added");
      } else {
        const errorData = await addRes.json().catch(() => ({}));
        toast.error(errorData.error || "Failed to add image");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload image";
      toast.error(message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        e.target.value = "";
        return;
      }
      handleAddImage(file);
    } else if (file) {
      toast.error("Please select an image file");
    }
    e.target.value = "";
  };

  const handleReextractDna = async () => {
    const images = avatar.referenceImages;
    if (!images || images.length === 0) {
      toast.error("No reference images to extract DNA from");
      return;
    }

    setExtracting(true);
    try {
      // Fetch first image and convert to base64
      const imageUrl = images[0];
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch reference image");
      }
      const blob = await response.blob();
      const mimeType = blob.type || "image/jpeg"; // Detect actual MIME type
      const reader = new FileReader();
      const imageBase64: string = await new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(blob);
      });

      const res = await fetch("/api/avatars/extract-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: [{ data: imageBase64, mime_type: mimeType }],
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "DNA extraction failed");
      }

      const data = await res.json();
      if (!data.dna) {
        throw new Error("No DNA data returned from extraction");
      }
      const extractedDna = data.dna;

      // Update avatar with new DNA
      const updateRes = await fetch(`/api/avatars/${avatar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dna: extractedDna }),
      });

      if (updateRes.ok) {
        const updated = await updateRes.json();
        onUpdate?.(updated);
        toast.success("DNA re-extracted successfully");
      }
    } catch {
      toast.error("Failed to re-extract DNA");
    } finally {
      setExtracting(false);
    }
  };

  const handleUseInChat = () => {
    router.push(`/chat?avatar=${avatar.id}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {/* Avatar thumbnail */}
            <div
              className={cn(
                "size-14 shrink-0 rounded-full overflow-hidden flex items-center justify-center",
                !avatar.thumbnailUrl && getAvatarColor(avatar.name)
              )}
            >
              {avatar.thumbnailUrl ? (
                <img
                  src={avatar.thumbnailUrl}
                  alt={avatar.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-white/90">
                  {getInitials(avatar.name)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="space-y-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Avatar name"
                    className="h-8 text-sm font-semibold"
                  />
                  <Input
                    value={editTag}
                    onChange={(e) => setEditTag(e.target.value)}
                    placeholder="Tag (optional)"
                    className="h-7 text-xs"
                  />
                </div>
              ) : (
                <>
                  <DialogTitle className="truncate">{avatar.name}</DialogTitle>
                  <DialogDescription className="flex items-center gap-2 mt-1">
                    {avatar.tag && (
                      <Badge variant="outline" className="text-xs">
                        {avatar.tag}
                      </Badge>
                    )}
                    {avatar.isSystem && (
                      <Badge variant="secondary" className="text-xs">
                        System
                      </Badge>
                    )}
                  </DialogDescription>
                </>
              )}
            </div>

            {/* Edit/Save buttons - TODO: Restrict to super admin for system avatars */}
            <div className="flex gap-1">
              {editing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={cancelEditing}
                      disabled={saving}
                    >
                      <X className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={startEditing}
                  >
                    <Pencil className="size-4" />
                  </Button>
                )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 pb-2">
            {/* Reference Images */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Reference Images
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  Add Image
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {avatar.referenceImages && avatar.referenceImages.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {avatar.referenceImages.map((imageUrl, index) => (
                    <div
                      key={`${imageUrl}-${index}`}
                      className="relative aspect-square rounded-lg overflow-hidden border group"
                    >
                      <img
                        src={imageUrl}
                        alt={`Reference ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute top-1 right-1 size-5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-destructive"
                        onClick={() => handleDeleteImage(imageUrl)}
                        disabled={deletingImage === imageUrl}
                      >
                        {deletingImage === imageUrl ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <X className="size-3" />
                        )}
                      </button>
                    </div>
                  ))}

                  {/* Add image placeholder */}
                  <button
                    type="button"
                    className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center hover:border-muted-foreground/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    ) : (
                      <ImagePlus className="size-5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-muted-foreground/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to add reference images
                  </p>
                </div>
              )}

              {/* Re-extract DNA button */}
              {avatar.referenceImages &&
                avatar.referenceImages.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleReextractDna}
                    disabled={extracting}
                  >
                    {extracting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {extracting ? "Re-extracting DNA..." : "Re-extract DNA from Images"}
                  </Button>
                )}
            </div>

            {/* DNA Section */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Avatar DNA
              </h4>

              {editing ? (
                <div className="grid grid-cols-2 gap-3">
                  {DNA_KEYS.map((key) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </label>
                      <Textarea
                        className="text-xs min-h-[60px] resize-none"
                        placeholder={`Describe ${key.replace(/_/g, " ")}...`}
                        value={editDna[key] || ""}
                        onChange={(e) =>
                          setEditDna((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {DNA_KEYS.map((key) => {
                    const value = dna[key];
                    if (!value) return null;
                    return (
                      <div
                        key={key}
                        className="flex gap-2 py-2 border-b last:border-b-0"
                      >
                        <span className="text-xs font-medium text-muted-foreground capitalize w-24 shrink-0">
                          {key.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-foreground">
                          {String(value)}
                        </span>
                      </div>
                    );
                  })}
                  {DNA_KEYS.every((key) => !dna[key]) && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No DNA data. Click "Re-extract DNA" to generate.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          {/* TODO: Restrict delete to super admin for system avatars */}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting || editing}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete
          </Button>
          <Button size="sm" onClick={handleUseInChat} disabled={editing}>
            <ExternalLink className="size-4" />
            Use in Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
