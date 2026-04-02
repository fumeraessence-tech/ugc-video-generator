"use client";

import { useCallback, useRef, useState } from "react";
import { useBulkGeneratorStore } from "@/stores/bulk-generator-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Upload, X, ImageIcon, Package, FileText } from "lucide-react";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function ReferenceStep() {
  const {
    referenceImages, addReferenceImages, removeReferenceImage,
    boxImages, addBoxImages, removeBoxImage,
    notesReferenceImages, addNotesReferenceImages, removeNotesReferenceImage,
  } = useBulkGeneratorStore();

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remainingSlots = MAX_FILES - referenceImages.length;

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      if (files.length > remainingSlots) {
        setError(`You can upload at most ${remainingSlots} more image${remainingSlots === 1 ? "" : "s"}.`);
        return;
      }
      const oversized = files.find((f) => f.size > MAX_FILE_SIZE);
      if (oversized) {
        setError(`"${oversized.name}" exceeds the 10 MB limit.`);
        return;
      }
      const invalidType = files.find((f) => !f.type.startsWith("image/"));
      if (invalidType) {
        setError(`"${invalidType.name}" is not an image file.`);
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        files.forEach((file) => formData.append("files", file));

        const res = await fetch("/api/bulk-generator/upload-reference", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? body?.error ?? `Upload failed (${res.status})`);
        }

        const data: { urls: string[]; count: number } = await res.json();
        addReferenceImages(data.urls);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="size-5" />
            Reference Bottle Images
          </CardTitle>
          <CardDescription>
            Upload images of the original perfume bottle (e.g., Fumera). These
            will be used as the base shape, cap style, and typography reference
            for all generated products.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {remainingSlots > 0 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
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
                  {uploading ? "Uploading..." : "Upload reference bottle images"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Drag and drop or click to browse &middot; Max 10 MB each &middot; Up to {MAX_FILES} images
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          {referenceImages.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {referenceImages.map((url) => (
                <div
                  key={url}
                  className="group relative overflow-hidden rounded-xl border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Reference bottle"
                    className="aspect-square w-full object-cover"
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

          <p className="text-xs text-muted-foreground">
            {referenceImages.length} / {MAX_FILES} reference images uploaded
          </p>
        </CardContent>
      </Card>

      {/* Box Images (Optional) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-5" />
            Box / Packaging Images (Optional)
          </CardTitle>
          <CardDescription>
            Upload box/packaging reference images. If provided, a matching box
            will be generated for each product with the gradient color from the
            BOX_COLOR CSV column.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <BoxUploadZone addBoxImages={addBoxImages} />

          {boxImages.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {boxImages.map((url) => (
                <div
                  key={url}
                  className="group relative overflow-hidden rounded-xl border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Reference box"
                    className="aspect-square w-full object-cover"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute right-2 top-2 size-8 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                    onClick={() => removeBoxImage(url)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {boxImages.length} box images uploaded (optional)
          </p>
        </CardContent>
      </Card>

      {/* Notes Reference (Optional) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Notes Infographic Reference (Optional)
          </CardTitle>
          <CardDescription>
            Upload a reference image for the Key Notes infographic layout. This
            will be used as a layout template — same card placement, text
            positioning, and style — for all products. Each product&apos;s notes
            image will be inspired by this reference but unique.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <NotesRefUploadZone addNotesReferenceImages={addNotesReferenceImages} />

          {notesReferenceImages.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {notesReferenceImages.map((url) => (
                <div
                  key={url}
                  className="group relative overflow-hidden rounded-xl border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Notes reference"
                    className="aspect-square w-full object-cover"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute right-2 top-2 size-8 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                    onClick={() => removeNotesReferenceImage(url)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {notesReferenceImages.length} notes reference images uploaded (optional)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function BoxUploadZone({ addBoxImages }: { addBoxImages: (urls: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setUploading(true);
      try {
        const formData = new FormData();
        files.forEach((file) => formData.append("files", file));
        const res = await fetch("/api/bulk-generator/upload-box", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? body?.error ?? `Upload failed (${res.status})`);
        }
        const data: { urls: string[]; count: number } = await res.json();
        addBoxImages(data.urls);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [addBoxImages]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) uploadFiles(files);
        }}
        onDragOver={(e) => e.preventDefault()}
        disabled={uploading}
        className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Upload className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">
          {uploading ? "Uploading..." : "Upload box/packaging images"}
        </p>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) uploadFiles(files);
          e.target.value = "";
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}

function NotesRefUploadZone({ addNotesReferenceImages }: { addNotesReferenceImages: (urls: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setUploading(true);
      try {
        const formData = new FormData();
        files.forEach((file) => formData.append("files", file));
        const res = await fetch("/api/bulk-generator/upload-notes-reference", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? body?.error ?? `Upload failed (${res.status})`);
        }
        const data: { urls: string[]; count: number } = await res.json();
        addNotesReferenceImages(data.urls);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [addNotesReferenceImages]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) uploadFiles(files);
        }}
        onDragOver={(e) => e.preventDefault()}
        disabled={uploading}
        className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Upload className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">
          {uploading ? "Uploading..." : "Upload notes layout reference"}
        </p>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) uploadFiles(files);
          e.target.value = "";
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}
