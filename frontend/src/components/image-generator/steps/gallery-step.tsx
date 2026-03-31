"use client";

import { useState, useCallback } from "react";
import { useImageGeneratorStore } from "@/stores/image-generator-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  RotateCcw,
  Download,
  Loader2,
  Eye,
  PackageCheck,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Component ──────────────────────────────────────────────────

export function GalleryStep() {
  const {
    generatedImages,
    updateGeneratedImage,
    productImages,
    bottleImages,
    boxImages,
    referenceImages,
    productName,
    brandName,
    liquidColor,
    productDNA,
  } = useImageGeneratorStore();

  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  const [downloadingZip, setDownloadingZip] = useState(false);

  const successImages = generatedImages.filter((img) => img.status === "done");

  // ─── Regenerate Single Image ──────────────────────────────

  const handleRegenerate = useCallback(
    async (shotType: string) => {
      setRegeneratingIds((prev) => new Set(prev).add(shotType));
      updateGeneratedImage(shotType, { status: "generating" });

      try {
        const response = await fetch("/api/image-generator/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shot_type: shotType,
            product_images: productImages,
            bottle_images: bottleImages,
            box_images: boxImages,
            reference_images: referenceImages,
            product_name: productName,
            brand_name: brandName,
            liquid_color: liquidColor,
            product_dna: productDNA,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Regeneration failed: ${response.status} ${text}`);
        }

        const data = await response.json();
        updateGeneratedImage(shotType, {
          status: "done",
          imageUrl: data.image_url || "",
          prompt: data.prompt || "",
          error: undefined,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Regeneration failed";
        updateGeneratedImage(shotType, {
          status: "error",
          error: message,
        });
      } finally {
        setRegeneratingIds((prev) => {
          const next = new Set(prev);
          next.delete(shotType);
          return next;
        });
      }
    },
    [
      productImages,
      bottleImages,
      boxImages,
      referenceImages,
      productName,
      brandName,
      liquidColor,
      productDNA,
      updateGeneratedImage,
    ]
  );

  // ─── Download Single Image ────────────────────────────────

  const handleDownload = useCallback((imageUrl: string, label: string) => {
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `${label.toLowerCase().replace(/\s+/g, "_")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // ─── Download All as ZIP ──────────────────────────────────

  const handleDownloadZip = useCallback(async () => {
    setDownloadingZip(true);
    try {
      const imageUrls = successImages.map((img) => img.imageUrl);
      const response = await fetch("/api/image-generator/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_urls: imageUrls,
          product_name: productName,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create ZIP");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${productName || "product"}_images.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("ZIP download failed:", err);
    } finally {
      setDownloadingZip(false);
    }
  }, [successImages, productName]);

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Image Gallery</h2>
          <p className="text-muted-foreground">
            {successImages.length} image{successImages.length !== 1 ? "s" : ""}{" "}
            generated for {productName || "your product"}.
          </p>
        </div>

        {/* Bulk download */}
        {successImages.length > 0 && (
          <Button
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            className="gap-2"
          >
            {downloadingZip ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating ZIP...
              </>
            ) : (
              <>
                <PackageCheck className="size-4" />
                Download All (ZIP)
              </>
            )}
          </Button>
        )}
      </div>

      {/* Empty state */}
      {generatedImages.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground">
          <AlertCircle className="mb-3 size-10" />
          <p className="text-lg font-medium">No images generated yet</p>
          <p className="text-sm">Go back to the Generate step to create images.</p>
        </div>
      )}

      {/* Image grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {generatedImages.map((img) => {
          const isRegenerating = regeneratingIds.has(img.id);
          const isError = img.status === "error";
          const isDone = img.status === "done" && !!img.imageUrl;

          return (
            <Card
              key={img.id}
              className={cn(
                "overflow-hidden transition-all",
                isError && "ring-2 ring-destructive/50"
              )}
            >
              <CardContent className="p-0">
                {/* Image area */}
                <div className="relative aspect-square bg-muted">
                  {isDone && !isRegenerating && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.imageUrl}
                        alt={img.label}
                        className="h-full w-full object-cover"
                      />

                      {/* Preview overlay on hover */}
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all hover:bg-black/40 hover:opacity-100">
                            <Eye className="size-8 text-white" />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.imageUrl}
                            alt={img.label}
                            className="h-auto w-full rounded-md"
                          />
                        </DialogContent>
                      </Dialog>
                    </>
                  )}

                  {isRegenerating && (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="mx-auto mb-2 size-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">
                          Regenerating...
                        </p>
                      </div>
                    </div>
                  )}

                  {isError && !isRegenerating && (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center text-destructive">
                        <AlertCircle className="mx-auto mb-2 size-8" />
                        <p className="text-sm">{img.error || "Failed"}</p>
                      </div>
                    </div>
                  )}

                  {/* Error badge */}
                  {isError && !isRegenerating && (
                    <Badge
                      variant="destructive"
                      className="absolute left-2 top-2"
                    >
                      Failed
                    </Badge>
                  )}
                </div>

                {/* Footer with label + actions */}
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-sm font-medium">{img.label}</p>
                  <div className="flex gap-1">
                    {/* Regenerate */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => handleRegenerate(img.shotType)}
                      disabled={isRegenerating}
                      title="Regenerate"
                    >
                      {isRegenerating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                    </Button>

                    {/* Download */}
                    {isDone && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => handleDownload(img.imageUrl, img.label)}
                        title="Download"
                      >
                        <Download className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
