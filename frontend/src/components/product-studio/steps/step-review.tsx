"use client";

import { useState } from "react";
import { Download, Eye, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useProductStudioStore, type StyledImage } from "@/stores/product-studio-store";
import { backendFetch } from "@/lib/backend-fetch";

export function StepReview() {
  const store = useProductStudioStore();
  const { toast } = useToast();
  const [lightboxImage, setLightboxImage] = useState<StyledImage | null>(null);

  const whiteBgSuccess = store.whiteBgResults.filter((r) => r.status === "success");
  const inspirationSuccess = store.inspirationResults.filter((r) => r.status === "success");

  const hasResults = whiteBgSuccess.length > 0 || inspirationSuccess.length > 0;

  const downloadAll = async () => {
    const allUrls: string[] = [];
    for (const r of whiteBgSuccess) {
      if (r.image_url) allUrls.push(r.image_url);
    }
    for (const r of inspirationSuccess) {
      for (const img of r.images) {
        if (img.image_url && !img.image_url.startsWith("Error")) {
          allUrls.push(img.image_url);
        }
      }
    }

    if (allUrls.length === 0) {
      toast({ title: "No images to download", variant: "destructive" });
      return;
    }

    try {
      const res = await backendFetch("/api/v1/product-studio/download-zip", {
        method: "POST",
        body: JSON.stringify({ image_urls: allUrls, product_name: "product-studio-all" }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "product_studio_all_images.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    }
  };

  if (!hasResults) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">No results yet. Run generation first.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {whiteBgSuccess.length} white-bg + {inspirationSuccess.length} styled products
          </p>
          <p className="text-xs text-muted-foreground">
            {whiteBgSuccess.length + inspirationSuccess.reduce((a, r) => a + r.count, 0)} total images
          </p>
        </div>
        <Button onClick={downloadAll} size="sm" variant="outline">
          <Archive className="size-3 mr-1.5" />
          Download All (ZIP)
        </Button>
      </div>

      {/* White BG Results */}
      {whiteBgSuccess.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">White Background Images</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {whiteBgSuccess.map((result) => (
                <div key={result.product_index} className="space-y-1">
                  <div className="relative group aspect-square rounded border bg-white overflow-hidden">
                    <img
                      src={result.image_url}
                      alt={result.perfume_name}
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxImage({
                            style: "white-bg",
                            label: result.perfume_name,
                            image_url: result.image_url,
                          })
                        }
                        className="p-1.5 bg-white/90 rounded-full"
                      >
                        <Eye className="size-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center truncate">
                    {result.perfume_name}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inspiration Results */}
      {inspirationSuccess.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Styled Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {inspirationSuccess.map((result) => (
              <div key={result.product_index} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{result.perfume_name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {result.count} images
                  </Badge>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {result.images
                    .filter((img) => img.image_url && !img.image_url.startsWith("Error"))
                    .map((img, i) => (
                      <div key={i} className="space-y-1">
                        <div className="relative group aspect-square rounded border overflow-hidden">
                          <img
                            src={img.image_url}
                            alt={img.label}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => setLightboxImage(img)}
                              className="p-1.5 bg-white/90 rounded-full"
                            >
                              <Eye className="size-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center truncate">
                          {img.label}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{lightboxImage?.label}</DialogTitle>
          </DialogHeader>
          {lightboxImage?.image_url && (
            <img src={lightboxImage.image_url} alt={lightboxImage.label} className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
