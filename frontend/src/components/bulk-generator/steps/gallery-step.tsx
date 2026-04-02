"use client";

import { useState, useCallback } from "react";
import JSZip from "jszip";
import { useBulkGeneratorStore, type BulkGeneratedImage } from "@/stores/bulk-generator-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, GalleryHorizontalEnd, X, RefreshCw, Loader2 } from "lucide-react";

export function GalleryStep() {
  const {
    generatedImages,
    csvRows,
    referenceImages,
    boxImages,
    notesReferenceImages,
    brandName,
    pinterestImages,
    avatarImages,
    updateGeneratedImage,
  } = useBulkGeneratorStore();
  const [downloading, setDownloading] = useState(false);
  const [lightbox, setLightbox] = useState<BulkGeneratedImage | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());

  const doneImages = generatedImages.filter((img) => img.status === "done" && img.imageUrl);

  // Unique product names for filter
  const productNames = [...new Set(doneImages.map((img) => img.productName))];

  const filteredImages =
    filter === "all"
      ? doneImages
      : doneImages.filter((img) => img.productName === filter);

  // Group by product
  const imagesByProduct = filteredImages.reduce<Record<string, BulkGeneratedImage[]>>(
    (acc, img) => {
      const key = `${img.rowIndex}-${img.productName}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(img);
      return acc;
    },
    {}
  );

  const downloadZip = useCallback(async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();

      // Group images by product name into folders
      for (const img of doneImages) {
        const folderName = img.productName || "Unknown";
        const fileName = `${img.label}.png`;
        const folder = zip.folder(folderName)!;

        // Fetch the image directly (same-origin, no proxy needed)
        const res = await fetch(img.imageUrl);
        if (res.ok) {
          const blob = await res.blob();
          folder.file(fileName, blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bulk-products_images.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [doneImages]);

  const regenerateSingleShot = useCallback(async (img: BulkGeneratedImage) => {
    const row = csvRows[img.rowIndex];
    if (!row) return;

    const id = img.id;
    setRegeneratingIds((prev) => new Set(prev).add(id));
    updateGeneratedImage(id, { status: "generating", error: undefined });

    try {
      const pinterestUrls = pinterestImages[String(img.rowIndex)] ?? [];
      const avatarUrls = avatarImages[String(img.rowIndex)] ?? [];

      const res = await fetch("/api/bulk-generator/regenerate-shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: img.productName,
          liquid_color: row.LIQUID_COLOR ?? "",
          brand_name: brandName,
          shot_angle: img.angle,
          reference_images: referenceImages,
          box_images: boxImages,
          pinterest_urls: pinterestUrls,
          avatar_urls: avatarUrls,
          notes_reference_images: notesReferenceImages,
          row_data: row,
          row_index: img.rowIndex,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? body?.detail ?? `Regeneration failed (${res.status})`);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const dataStr = line.slice(5).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === "image" && data.image_url) {
                updateGeneratedImage(id, { imageUrl: data.image_url, status: "done", error: undefined });
              } else if (currentEvent === "error") {
                updateGeneratedImage(id, { status: "error", error: data.message ?? "Regeneration failed" });
              }
            } catch { /* skip malformed */ }
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      updateGeneratedImage(id, { status: "error", error: err instanceof Error ? err.message : "Regeneration failed" });
    } finally {
      setRegeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [csvRows, referenceImages, boxImages, notesReferenceImages, brandName, pinterestImages, avatarImages, updateGeneratedImage]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GalleryHorizontalEnd className="size-5" />
              Gallery
            </div>
            <Button onClick={downloadZip} disabled={downloading || doneImages.length === 0}>
              <Download className="mr-1 size-4" />
              {downloading ? "Downloading..." : `Download All (${doneImages.length} images)`}
            </Button>
          </CardTitle>
          <CardDescription>
            {doneImages.length} images generated for {productNames.length} products.
            Hover any image to regenerate it.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Product Filter */}
          {productNames.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={filter === "all" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilter("all")}
              >
                All ({doneImages.length})
              </Badge>
              {productNames.map((name) => {
                const count = doneImages.filter((img) => img.productName === name).length;
                return (
                  <Badge
                    key={name}
                    variant={filter === name ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setFilter(name)}
                  >
                    {name} ({count})
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Images Grid by Product */}
          {Object.entries(imagesByProduct).map(([key, images]) => {
            const productName = images[0]?.productName || "Unknown";
            return (
              <div key={key} className="space-y-3">
                <h3 className="text-sm font-semibold">{productName}</h3>
                <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="group relative overflow-hidden rounded-xl border bg-muted transition-shadow hover:shadow-lg"
                    >
                      {img.status === "generating" || regeneratingIds.has(img.id) ? (
                        <div className="flex aspect-square flex-col items-center justify-center gap-2">
                          <Loader2 className="size-6 animate-spin text-primary" />
                          <span className="text-[10px] text-muted-foreground">Regenerating...</span>
                        </div>
                      ) : (
                        <button
                          className="w-full"
                          onClick={() => setLightbox(img)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.imageUrl}
                            alt={`${img.productName} - ${img.label}`}
                            className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                          />
                        </button>
                      )}
                      {/* Action buttons on hover */}
                      {img.status === "done" && !regeneratingIds.has(img.id) && (
                        <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="secondary"
                            size="icon"
                            className="size-7 shadow-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              const a = document.createElement("a");
                              a.href = img.imageUrl;
                              a.download = `${img.productName} - ${img.label}.png`;
                              a.click();
                            }}
                            title="Download this image"
                          >
                            <Download className="size-3.5" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="size-7 shadow-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              regenerateSingleShot(img);
                            }}
                            disabled={regeneratingIds.has(img.id)}
                            title="Regenerate this image"
                          >
                            <RefreshCw className="size-3.5" />
                          </Button>
                        </div>
                      )}
                      <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                        {img.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {doneImages.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No images generated yet. Go back to the Generate step to start.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="absolute -right-2 -top-2 z-10 flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-background shadow-lg"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = lightbox.imageUrl;
                  a.download = `${lightbox.productName} - ${lightbox.label}.png`;
                  a.click();
                }}
                title="Download this image"
              >
                <Download className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-background shadow-lg"
                onClick={() => {
                  regenerateSingleShot(lightbox);
                  setLightbox(null);
                }}
                disabled={regeneratingIds.has(lightbox.id)}
                title="Regenerate this image"
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-background shadow-lg"
                onClick={() => setLightbox(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.imageUrl}
              alt={`${lightbox.productName} - ${lightbox.label}`}
              className="max-h-[85vh] rounded-lg object-contain"
            />
            <div className="mt-2 text-center">
              <p className="text-sm font-medium text-white">{lightbox.productName}</p>
              <p className="text-xs text-white/70">{lightbox.label}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
