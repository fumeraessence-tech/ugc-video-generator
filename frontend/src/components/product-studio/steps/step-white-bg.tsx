"use client";

import { useEffect, useRef, useCallback } from "react";
import { Play, Pause, Square, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useProductStudioStore } from "@/stores/product-studio-store";
import { backendFetch } from "@/lib/backend-fetch";

export function StepWhiteBg() {
  const store = useProductStudioStore();
  const { toast } = useToast();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = store.whiteBgStatus === "running" || store.whiteBgStatus === "paused";

  const startPolling = useCallback(
    (jobId: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        try {
          const res = await backendFetch(`/api/v1/product-studio/job/${jobId}/status`);
          const data = await res.json();
          store.setWhiteBgStatus(data.status);
          store.setWhiteBgProgress(data.progress || 0);
          store.setWhiteBgMessage(data.message || "");
          store.setWhiteBgCurrentProduct(data.current_product_name || "");
          store.setWhiteBgCompletedCount(data.completed_count || 0);
          store.setWhiteBgTotalProducts(data.total_products || 0);
          store.setWhiteBgPaused(data.paused || false);
          if (data.results) store.setWhiteBgResults(data.results);

          if (data.status === "completed" || data.status === "cancelled") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            toast({
              title: data.status === "completed" ? "White-bg generation complete!" : "Generation cancelled",
              description: `${data.completed_count} products processed`,
            });
          }
        } catch {
          // ignore
        }
      }, 2000);
    },
    [store, toast]
  );

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    if (store.whiteBgJobId && isActive && !pollingRef.current) {
      startPolling(store.whiteBgJobId);
    }
  }, [store.whiteBgJobId, isActive, startPolling]);

  const startGeneration = async () => {
    if (store.selectedProductIndices.length === 0) {
      toast({ title: "No products selected", variant: "destructive" });
      return;
    }

    store.setWhiteBgStatus("running");
    store.setWhiteBgProgress(0);
    store.setWhiteBgMessage("Starting...");
    store.setWhiteBgResults([]);

    try {
      const res = await backendFetch("/api/v1/product-studio/white-bg/start", {
        method: "POST",
        body: JSON.stringify({
          products: store.csvProducts,
          bottle_images: store.bottleImages,
          aspect_ratio: "1:1",
          product_indices: store.selectedProductIndices,
        }),
      });
      const data = await res.json();
      if (data.success) {
        store.setWhiteBgJobId(data.job_id);
        store.setWhiteBgTotalProducts(data.total_products);
        startPolling(data.job_id);
        toast({ title: "Generation started", description: `${data.total_products} products` });
      }
    } catch (e) {
      store.setWhiteBgStatus("");
      toast({ title: "Failed to start", description: String(e), variant: "destructive" });
    }
  };

  const pauseJob = async () => {
    if (!store.whiteBgJobId) return;
    await backendFetch(`/api/v1/product-studio/job/${store.whiteBgJobId}/pause`, { method: "POST" });
    store.setWhiteBgPaused(true);
  };

  const resumeJob = async () => {
    if (!store.whiteBgJobId) return;
    await backendFetch(`/api/v1/product-studio/job/${store.whiteBgJobId}/resume`, { method: "POST" });
    store.setWhiteBgPaused(false);
  };

  const cancelJob = async () => {
    if (!store.whiteBgJobId) return;
    await backendFetch(`/api/v1/product-studio/job/${store.whiteBgJobId}/cancel`, { method: "POST" });
  };

  const progress = store.whiteBgProgress || 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Rocket className="size-4" />
              White Background Generation
            </CardTitle>
            {store.whiteBgJobId && (
              <Badge variant="outline" className="text-xs font-mono">
                {store.whiteBgJobId}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Generate Amazon-style 1:1 white-background ecommerce images for each product.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Start button */}
          {!isActive && store.whiteBgStatus !== "completed" && (
            <Button onClick={startGeneration} className="w-full" size="lg">
              <Rocket className="size-4 mr-2" />
              Generate White-BG Images ({store.selectedProductIndices.length} products)
            </Button>
          )}

          {/* Progress */}
          {(isActive || store.whiteBgStatus === "completed" || store.whiteBgStatus === "cancelled") && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {store.whiteBgMessage || (store.whiteBgPaused ? "Paused" : "Processing...")}
                  </span>
                  <span className="font-mono">{progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      store.whiteBgPaused
                        ? "bg-yellow-500"
                        : store.whiteBgStatus === "completed"
                        ? "bg-foreground"
                        : "bg-foreground/70"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {store.whiteBgCompletedCount} / {store.whiteBgTotalProducts} products
                  </span>
                  {store.whiteBgCurrentProduct && isActive && (
                    <span className="flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" />
                      {store.whiteBgCurrentProduct}
                    </span>
                  )}
                </div>
              </div>

              {/* Controls */}
              {isActive && (
                <div className="flex gap-2">
                  {store.whiteBgPaused ? (
                    <Button onClick={resumeJob} variant="outline" className="flex-1" size="sm">
                      <Play className="size-3 mr-1.5" />
                      Resume
                    </Button>
                  ) : (
                    <Button onClick={pauseJob} variant="outline" className="flex-1" size="sm">
                      <Pause className="size-3 mr-1.5" />
                      Pause
                    </Button>
                  )}
                  <Button onClick={cancelJob} variant="destructive" size="sm">
                    <Square className="size-3 mr-1.5" />
                    Cancel
                  </Button>
                </div>
              )}

              {store.whiteBgStatus === "completed" && (
                <p className="text-center text-sm font-medium py-2">
                  {store.whiteBgResults.filter((r) => r.status === "success").length} images generated
                </p>
              )}
            </>
          )}

          {/* Results grid */}
          {store.whiteBgResults.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {store.whiteBgResults.map((result) => (
                <div key={result.product_index} className="space-y-1">
                  <div className="aspect-square rounded border bg-muted overflow-hidden">
                    {result.status === "success" && result.image_url ? (
                      <img
                        src={result.image_url}
                        alt={result.perfume_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        Error
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center truncate">
                    {result.perfume_name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
