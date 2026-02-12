"use client";

import { useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, X, Loader2, ImagePlus, Check, AlertTriangle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { AvatarData } from "./avatar-card";

const DEFAULT_DNA = {
  gender: "",
  face: "",
  skin: "",
  eyes: "",
  hair: "",
  body: "",
  voice: "",
  wardrobe: "",
  ethnicity: "",
  age_range: "",
  prohibited_drift: "",
};

const ANGLE_ZONES = [
  { key: "front", label: "Front View", required: true, icon: "正" },
  { key: "left_profile", label: "Left Side", required: true, icon: "左" },
  { key: "right_profile", label: "Right Side", required: true, icon: "右" },
  { key: "back", label: "Back (optional)", required: false, icon: "背" },
] as const;

type AngleKey = (typeof ANGLE_ZONES)[number]["key"];

interface UploadedImage {
  url: string;
  file?: File;
  uploading?: boolean;
  angle?: string;
}

interface AngleImages {
  front: string | null;
  left_profile: string | null;
  right_profile: string | null;
  back: string | null;
}

interface CreateAvatarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (avatar: AvatarData) => void;
}

export function CreateAvatarDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateAvatarDialogProps) {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [dna, setDna] = useState<Record<string, string>>(DEFAULT_DNA);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [angleImages, setAngleImages] = useState<AngleImages>({
    front: null,
    left_profile: null,
    right_profile: null,
    back: null,
  });
  const [classifying, setClassifying] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const angleInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const requiredAnglesCovered = ANGLE_ZONES.filter(
    (z) => z.required && angleImages[z.key]
  ).length;
  const totalRequired = ANGLE_ZONES.filter((z) => z.required).length;

  const resetForm = useCallback(() => {
    setName("");
    setTag("");
    setDna(DEFAULT_DNA);
    setImages([]);
    setAngleImages({ front: null, left_profile: null, right_profile: null, back: null });
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) resetForm();
      onOpenChange(value);
    },
    [onOpenChange, resetForm]
  );

  const uploadFile = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/avatars/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }

      const { imageUrl } = await res.json();
      return imageUrl;
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    }
  };

  const handleAngleUpload = useCallback(
    async (angle: AngleKey, files: FileList | File[]) => {
      const file = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (!file) return;

      // Show preview immediately
      const previewUrl = URL.createObjectURL(file);
      setAngleImages((prev) => ({ ...prev, [angle]: previewUrl }));

      // Upload to server
      const uploadedUrl = await uploadFile(file);
      if (uploadedUrl) {
        setAngleImages((prev) => ({ ...prev, [angle]: uploadedUrl }));
        // Also add to general images list
        setImages((prev) => [...prev, { url: uploadedUrl, uploading: false, angle }]);
        toast.success(`${angle.replace(/_/g, " ")} image uploaded`);
      } else {
        setAngleImages((prev) => ({ ...prev, [angle]: null }));
        toast.error(`Failed to upload ${angle.replace(/_/g, " ")} image`);
      }
    },
    []
  );

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (imageFiles.length === 0) return;

    const newImages: UploadedImage[] = imageFiles.map((file) => ({
      url: URL.createObjectURL(file),
      file,
      uploading: true,
    }));

    setImages((prev) => [...prev, ...newImages]);

    for (const file of imageFiles) {
      const uploadedUrl = await uploadFile(file);
      setImages((prev) =>
        prev.map((img) => {
          if (img.file === file) {
            if (uploadedUrl) {
              return { url: uploadedUrl, uploading: false };
            }
            return null as unknown as UploadedImage;
          }
          return img;
        }).filter(Boolean)
      );

      if (!uploadedUrl) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  }, []);

  const handleAutoClassify = useCallback(async () => {
    const uploadedImages = images.filter((img) => !img.uploading && img.url && !img.angle);
    if (uploadedImages.length === 0) {
      toast.error("No unclassified images to auto-classify");
      return;
    }

    setClassifying(true);
    try {
      const imageUrls = uploadedImages.map((img) => img.url);
      const res = await fetch("/api/avatars/classify-angles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls }),
      });

      if (!res.ok) throw new Error("Classification failed");

      const { referenceAngles, validation } = await res.json();

      // Update angle images from classification
      const newAngles = { ...angleImages };
      for (const [angle, url] of Object.entries(referenceAngles)) {
        if (angle in newAngles) {
          (newAngles as Record<string, string | null>)[angle] = url as string;
        }
      }
      setAngleImages(newAngles);

      // Update image angles
      setImages((prev) =>
        prev.map((img) => {
          for (const [angle, url] of Object.entries(referenceAngles)) {
            if (url === img.url) return { ...img, angle };
          }
          return img;
        })
      );

      if (validation?.complete) {
        toast.success("All required angles covered!");
      } else {
        const missing = validation?.missing?.join(", ") || "";
        toast.info(`Missing angles: ${missing}`);
      }
    } catch {
      toast.error("Auto-classification failed");
    } finally {
      setClassifying(false);
    }
  }, [images, angleImages]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
      e.target.value = "";
    },
    [handleFiles]
  );

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeAngleImage = useCallback((angle: AngleKey) => {
    setAngleImages((prev) => ({ ...prev, [angle]: null }));
    setImages((prev) => prev.filter((img) => img.angle !== angle));
  }, []);

  const handleExtractDna = useCallback(async () => {
    const allImageUrls = [
      ...Object.values(angleImages).filter(Boolean),
      ...images.filter((img) => !img.uploading && img.url).map((img) => img.url),
    ];

    if (allImageUrls.length === 0) {
      toast.error("Please upload at least one image first");
      return;
    }

    setExtracting(true);
    setError(null);

    try {
      const imageUrl = allImageUrls[0]!;
      let imageBase64: string | null = null;

      // Convert image URL to base64 — works for both local /uploads/ and full Supabase URLs
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      imageBase64 = await new Promise((resolve) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.readAsDataURL(blob);
      });

      if (!imageBase64) {
        throw new Error("Failed to convert image to base64");
      }

      const mimeType = blob.type || "image/jpeg";

      const res = await fetch("/api/avatars/extract-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: [{ data: imageBase64, mime_type: mimeType }],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "DNA extraction failed");
      }

      const { dna: extractedDna } = await res.json();
      setDna({
        gender: extractedDna.gender || "",
        face: extractedDna.face || "",
        skin: extractedDna.skin || "",
        eyes: extractedDna.eyes || "",
        hair: extractedDna.hair || "",
        body: extractedDna.body || "",
        voice: extractedDna.voice || "",
        wardrobe: extractedDna.wardrobe || "",
        ethnicity: extractedDna.ethnicity || "",
        age_range: extractedDna.age_range || "",
        prohibited_drift: extractedDna.prohibited_drift || "",
      });
      toast.success("DNA extracted successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "DNA extraction failed";
      setError(message);
      toast.error(message);
    } finally {
      setExtracting(false);
    }
  }, [images, angleImages]);

  const handleSubmit = async () => {
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const allImages = [
      ...Object.values(angleImages).filter(Boolean) as string[],
      ...images.filter((img) => !img.uploading && img.url && !img.angle).map((img) => img.url),
    ];

    if (allImages.length === 0) {
      setError("Please upload at least one image");
      return;
    }

    if (images.some((img) => img.uploading)) {
      setError("Please wait for all images to finish uploading");
      return;
    }

    setSubmitting(true);
    try {
      const referenceAngles: Record<string, string> = {};
      for (const [angle, url] of Object.entries(angleImages)) {
        if (url) referenceAngles[angle] = url;
      }

      const res = await fetch("/api/avatars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          tag: tag.trim() || undefined,
          dna,
          referenceImages: allImages,
          referenceAngles,
          thumbnailUrl: allImages[0],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create avatar");
      }

      const avatar = await res.json();
      toast.success("Avatar created successfully");
      onCreated?.(avatar);
      handleOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create avatar";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const uploadedCount = images.filter((img) => !img.uploading).length +
    Object.values(angleImages).filter(Boolean).length;
  const uploadingCount = images.filter((img) => img.uploading).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Create Custom Avatar</DialogTitle>
          <DialogDescription>
            Upload multi-angle reference images for consistent character generation.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-5 pb-2">
            {/* Name & Tag */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="avatar-name" className="text-sm font-medium">
                  Name *
                </label>
                <Input
                  id="avatar-name"
                  placeholder="e.g. Sarah Chen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="avatar-tag" className="text-sm font-medium">
                  Tag
                </label>
                <Input
                  id="avatar-tag"
                  placeholder="e.g. Tech Reviewer"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                />
              </div>
            </div>

            {/* Multi-Angle Reference Upload */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Reference Angles *</label>
                <Badge
                  variant={requiredAnglesCovered >= totalRequired ? "default" : "secondary"}
                  className="text-xs"
                >
                  {requiredAnglesCovered >= totalRequired ? (
                    <Check className="size-3 mr-1" />
                  ) : (
                    <AlertTriangle className="size-3 mr-1" />
                  )}
                  {requiredAnglesCovered}/{totalRequired} required angles
                </Badge>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {ANGLE_ZONES.map((zone) => {
                  const imageUrl = angleImages[zone.key];
                  return (
                    <div key={zone.key} className="space-y-1">
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        {zone.label}
                        {zone.required && <span className="text-destructive">*</span>}
                      </label>
                      {imageUrl ? (
                        <div className="relative aspect-square rounded-lg overflow-hidden border group">
                          <img
                            src={imageUrl}
                            alt={zone.label}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            className="absolute top-1 right-1 size-5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-destructive"
                            onClick={() => removeAngleImage(zone.key)}
                          >
                            <X className="size-3" />
                          </button>
                          <Badge
                            variant="secondary"
                            className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white"
                          >
                            {zone.key.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      ) : (
                        <div
                          className="relative flex flex-col items-center justify-center aspect-square rounded-lg border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors bg-muted/30"
                          onClick={() => angleInputRefs.current[zone.key]?.click()}
                        >
                          <User className="size-6 text-muted-foreground/40 mb-1" />
                          <span className="text-[10px] text-muted-foreground/60">{zone.icon}</span>
                          <input
                            ref={(el) => { angleInputRefs.current[zone.key] = el; }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files) handleAngleUpload(zone.key, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {requiredAnglesCovered < totalRequired && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  Upload front, left side, and right side photos for best consistency
                </p>
              )}
            </div>

            {/* Additional Images (general drop zone) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Additional Images</label>
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-3 transition-colors cursor-pointer",
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="size-6 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground text-center">
                  Drop extra images or click to browse
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Extra images preview */}
              {images.filter((img) => !img.angle).length > 0 && (
                <div className="grid grid-cols-6 gap-2 mt-2">
                  {images.filter((img) => !img.angle).map((img, i) => (
                    <div
                      key={`${img.url}-${i}`}
                      className="relative aspect-square rounded-lg overflow-hidden border group"
                    >
                      <img
                        src={img.url}
                        alt={`Extra ${i + 1}`}
                        className={cn(
                          "h-full w-full object-cover",
                          img.uploading && "opacity-50"
                        )}
                      />
                      {img.uploading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Loader2 className="size-4 animate-spin text-white" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            const globalIdx = images.indexOf(img);
                            if (globalIdx >= 0) removeImage(globalIdx);
                          }}
                        >
                          <X className="size-2.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Auto-classify + Extract DNA buttons */}
              <div className="flex gap-2 mt-2">
                {images.filter((img) => !img.uploading && !img.angle).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleAutoClassify}
                    disabled={classifying}
                  >
                    {classifying ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ImagePlus className="size-4" />
                    )}
                    {classifying ? "Classifying..." : "Auto-Classify Angles"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleExtractDna}
                  disabled={uploadedCount === 0 || extracting}
                >
                  {extracting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {extracting ? "Extracting DNA..." : "Extract DNA"}
                </Button>
              </div>
            </div>

            {/* DNA Fields */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Avatar DNA</label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(dna).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs text-muted-foreground capitalize">
                      {key.replace(/_/g, " ")}
                    </label>
                    <Textarea
                      className="text-xs min-h-[60px] resize-none"
                      placeholder={`Describe ${key.replace(/_/g, " ")}...`}
                      value={value}
                      onChange={(e) =>
                        setDna((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || uploadingCount > 0 || uploadedCount === 0 || !name.trim()}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Avatar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
