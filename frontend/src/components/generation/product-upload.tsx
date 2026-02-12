"use client";

import { useState, useCallback } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

interface ProductUploadProps {
  productImages: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
}

export function ProductUpload({
  productImages,
  onImagesChange,
  maxImages = 5,
}: ProductUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const { toast } = useToast();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (productImages.length >= maxImages) {
        toast({
          title: "Maximum images reached",
          description: `You can only upload up to ${maxImages} images.`,
          variant: "destructive",
        });
        return;
      }

      const validFiles = files.filter((file) => {
        const isValid = file.type.startsWith("image/");
        const isUnder10MB = file.size <= 10 * 1024 * 1024;
        if (!isValid) {
          toast({
            title: "Invalid file type",
            description: `${file.name} is not an image file.`,
            variant: "destructive",
          });
        }
        if (!isUnder10MB) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds 10MB limit.`,
            variant: "destructive",
          });
        }
        return isValid && isUnder10MB;
      });

      if (validFiles.length === 0) return;

      const remaining = maxImages - productImages.length;
      const filesToUpload = validFiles.slice(0, remaining);

      setUploading(true);

      try {
        const formData = new FormData();
        filesToUpload.forEach((file) => {
          formData.append("files", file);
        });

        const response = await fetch("/api/products/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Upload failed");
        }

        const data = await response.json();
        onImagesChange([...productImages, ...data.urls]);

        toast({
          title: "Upload successful",
          description: `${filesToUpload.length} image(s) uploaded.`,
        });
      } catch (error) {
        toast({
          title: "Upload failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    },
    [productImages, maxImages, onImagesChange, toast]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const files = Array.from(e.dataTransfer.files);
      await handleFiles(files);
    },
    [handleFiles]
  );

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files);
        await handleFiles(files);
      }
    },
    [handleFiles]
  );

  const removeImage = useCallback(
    (index: number) => {
      onImagesChange(productImages.filter((_, i) => i !== index));
    },
    [productImages, onImagesChange]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Product Images</h3>
          <p className="text-xs text-muted-foreground">
            Upload up to {maxImages} product images
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {productImages.length}/{maxImages}
        </span>
      </div>

      {productImages.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {productImages.map((url, index) => (
            <div key={index} className="relative group">
              <Card className="overflow-hidden">
                <div className="relative aspect-square">
                  <Image
                    src={url}
                    alt={`Product ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </div>
              </Card>
              <Button
                size="icon"
                variant="destructive"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeImage(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {productImages.length < maxImages && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            id="product-upload"
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleChange}
            disabled={uploading}
          />
          <label
            htmlFor="product-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            {uploading ? (
              <div className="h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium">
                {uploading ? "Uploading..." : "Drop images here or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG, WEBP up to 10MB each
              </p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
