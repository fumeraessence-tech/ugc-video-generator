"use client";

import { useState, useCallback } from "react";
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
import { Download, GalleryHorizontalEnd, X } from "lucide-react";

export function GalleryStep() {
  const { generatedImages, csvRows } = useBulkGeneratorStore();
  const [downloading, setDownloading] = useState(false);
  const [lightbox, setLightbox] = useState<BulkGeneratedImage | null>(null);
  const [filter, setFilter] = useState<string>("all");

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
      const imageUrls = doneImages.map((img) => img.imageUrl);
      const res = await fetch("/api/bulk-generator/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_urls: imageUrls,
          product_name: "bulk-products",
        }),
      });

      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
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
            {doneImages.length} images generated for {productNames.length} products
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
                    <button
                      key={img.id}
                      className="group overflow-hidden rounded-xl border bg-muted transition-shadow hover:shadow-lg"
                      onClick={() => setLightbox(img)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.imageUrl}
                        alt={`${img.productName} - ${img.label}`}
                        className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                        {img.label}
                      </p>
                    </button>
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
            <Button
              variant="ghost"
              size="icon"
              className="absolute -right-2 -top-2 z-10 rounded-full bg-background shadow-lg"
              onClick={() => setLightbox(null)}
            >
              <X className="size-4" />
            </Button>
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
