"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoPlayerInlineProps {
  url: string;
  title?: string;
  downloadable?: boolean;
}

export function VideoPlayerInline({
  url,
  title,
  downloadable = true,
}: VideoPlayerInlineProps) {
  return (
    <div className="mt-3 rounded-lg border overflow-hidden bg-black">
      <video
        src={url}
        controls
        className="w-full max-h-[400px]"
        preload="metadata"
      />
      {(title || downloadable) && (
        <div className="flex items-center justify-between bg-secondary/50 px-3 py-2">
          {title && <p className="text-sm font-medium truncate">{title}</p>}
          {downloadable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              asChild
            >
              <a href={url} download>
                <Download className="size-3.5" />
                Download
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
