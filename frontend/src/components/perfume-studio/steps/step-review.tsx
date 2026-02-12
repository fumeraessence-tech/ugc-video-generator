"use client";

import { useState } from "react";
import { RefreshCw, Download, Loader2, Eye, Archive } from "lucide-react";
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
import { usePerfumeStudioStore, type PerfumeGeneratedImage } from "@/stores/perfume-studio-store";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export function StepReview() {
  const store = usePerfumeStudioStore();
  const { toast } = useToast();
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<PerfumeGeneratedImage | null>(null);

  const successResults = store.batchResults.filter((r) => r.status === "success");

  const regenerateImage = async (productIdx: number, imageIdx: number, style: string) => {
    const result = store.batchResults.find((r) => r.product_index === productIdx);
    if (!result) return;

    const key = `${productIdx}-${style}`;
    setRegenerating(key);

    try {
      const product = store.csvProducts[productIdx] || {};
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/regenerate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perfume_info: {
            perfume_name: product.cleaned_name || product.perfume_name || result.perfume_name,
            brand_name: product.brand_name || result.brand_name,
            gender: product.gender || "unisex",
            notes: product.notes,
          },
          reference_images: store.getAllReferenceImages(),
          product_dna: store.productDNA,
          style,
          aspect_ratio: store.aspectRatio,
        }),
      });
      const data = await res.json();
      if (data.success && data.image) {
        const updated = { ...result };
        updated.images = [...result.images];
        updated.images[imageIdx] = data.image;
        store.updateBatchResult(productIdx, updated);
        toast({ title: "Image regenerated" });
      }
    } catch (e) {
      toast({ title: "Regeneration failed", description: String(e), variant: "destructive" });
    } finally {
      setRegenerating(null);
    }
  };

  const downloadProductZip = async (result: typeof successResults[0]) => {
    const urls = result.images.filter((i) => i.image_url && !i.image_url.startsWith("Error")).map((i) => i.image_url);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/download-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "product", product_name: result.perfume_name, image_urls: urls }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.perfume_name}_images.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    }
  };

  const downloadBatchZip = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/download-batch-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_results: successResults }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "perfume_batch_images.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    }
  };

  if (store.batchResults.length === 0) {
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{successResults.length} products generated</p>
          <p className="text-xs text-muted-foreground">
            {successResults.reduce((a, r) => a + r.count, 0)} total images
          </p>
        </div>
        {successResults.length > 0 && (
          <Button onClick={downloadBatchZip} size="sm" variant="outline">
            <Archive className="size-3 mr-1.5" />
            Download All (ZIP)
          </Button>
        )}
      </div>

      {store.batchResults.map((result) => (
        <Card key={result.product_index}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{result.perfume_name}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={result.status === "success" ? "default" : "destructive"} className="text-xs">
                  {result.status}
                </Badge>
                {result.status === "success" && (
                  <Button size="sm" variant="ghost" onClick={() => downloadProductZip(result)}>
                    <Download className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {result.error && <p className="text-xs text-destructive mb-2">{result.error}</p>}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {result.images.map((img, imgIdx) => {
                const regenKey = `${result.product_index}-${img.style}`;
                const isRegen = regenerating === regenKey;
                const hasImage = img.image_url && !img.image_url.startsWith("Error");

                return (
                  <div key={imgIdx} className="space-y-1">
                    <div className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                      {hasImage ? (
                        <>
                          <img src={img.image_url} alt={img.label} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => setLightboxImage(img)}
                              className="p-1.5 bg-white/90 rounded-full"
                            >
                              <Eye className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => regenerateImage(result.product_index, imgIdx, img.style)}
                              disabled={isRegen}
                              className="p-1.5 bg-white/90 rounded-full"
                            >
                              {isRegen ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                          Failed
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center truncate">{img.label}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

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
