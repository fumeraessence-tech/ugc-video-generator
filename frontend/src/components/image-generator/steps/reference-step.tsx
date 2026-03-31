"use client";

import { useCallback, useRef, useState } from "react";
import { useImageGeneratorStore } from "@/stores/image-generator-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Upload, X, ImageIcon } from "lucide-react";

const MAX_FILES = 2;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function ReferenceStep() {
  const {
    referenceImages,
    addReferenceImages,
    removeReferenceImage,
    setReferenceImages,
  } = useImageGeneratorStore();

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remainingSlots = MAX_FILES - referenceImages.length;

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setError(null);

      // Enforce max count
      if (files.length > remainingSlots) {
        setError(
          `You can upload at most ${remainingSlots} more image${remainingSlots === 1 ? "" : "s"}.`
        );
        return;
      }

      // Validate sizes
      const oversized = files.find((f) => f.size > MAX_FILE_SIZE);
      if (oversized) {
        setError(
          `"${oversized.name}" exceeds the 10 MB limit. Please choose a smaller file.`
        );
        return;
      }

      // Validate types
      const invalidType = files.find(
        (f) => !f.type.startsWith("image/")
      );
      if (invalidType) {
        setError(`"${invalidType.name}" is not an image file.`);
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        files.forEach((file) => formData.append("files", file));

        const res = await fetch("/api/image-generator/upload-reference", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.detail ?? body?.error ?? `Upload failed (${res.status})`
          );
        }

        const data: { urls: string[]; count: number } = await res.json();
        addReferenceImages(data.urls);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Upload failed. Please try again."
        );
      } finally {
        setUploading(false);
      }
    },
    [addReferenceImages, remainingSlots]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) uploadFiles(files);
      // Reset so re-selecting the same file still triggers onChange
      e.target.value = "";
    },
    [uploadFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) uploadFiles(files);
    },
    [uploadFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="size-5" />
            Reference Images
          </CardTitle>
          <CardDescription>
            Upload scene images you want to replicate. The system will keep the
            scene setup and replace the bottle with your product.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Drag-drop zone */}
          {remainingSlots > 0 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              disabled={uploading}
              className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              } ${uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
            >
              <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                <Upload className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {uploading
                    ? "Uploading..."
                    : "Upload 1\u20132 reference images from Pinterest or similar"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Drag and drop or click to browse &middot; Max 10 MB each
                </p>
              </div>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Uploaded reference previews */}
          {referenceImages.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {referenceImages.map((url) => (
                <div
                  key={url}
                  className="group relative overflow-hidden rounded-xl border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Reference scene"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute right-2 top-2 size-8 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                    onClick={() => removeReferenceImage(url)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Slot counter */}
          <p className="text-xs text-muted-foreground">
            {referenceImages.length} / {MAX_FILES} reference image
            {referenceImages.length === 1 ? "" : "s"} uploaded
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
