"use client";

import { X, Upload, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ImageUploadSlot({
  label,
  imageUrl,
  onUpload,
  onRemove,
  uploading,
  multiple = false,
  accept = "image/*",
  className,
}: {
  label: string;
  imageUrl: string | null;
  onUpload: (files: File[]) => void;
  onRemove: () => void;
  uploading: boolean;
  multiple?: boolean;
  accept?: string;
  className?: string;
}) {
  const inputId = `upload-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {imageUrl ? (
        <div className="relative group aspect-square w-full rounded-lg overflow-hidden border bg-muted">
          <img src={imageUrl} alt={label} className="absolute inset-0 w-full h-full object-cover" />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "flex flex-col items-center justify-center aspect-square w-full rounded-lg border-2 border-dashed cursor-pointer transition-colors",
            uploading ? "border-primary/50 bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5"
          )}
        >
          {uploading ? (
            <Loader2 className="size-6 animate-spin text-primary" />
          ) : (
            <>
              <Upload className="size-5 text-muted-foreground mb-1" />
              <span className="text-[10px] text-muted-foreground text-center px-1">{label}</span>
            </>
          )}
          <input
            id={inputId}
            type="file"
            accept={accept}
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) onUpload(files);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
