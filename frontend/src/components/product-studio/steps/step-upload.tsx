"use client";

import { useState, useCallback } from "react";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Check,
  X,
  ImageIcon,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useProductStudioStore } from "@/stores/product-studio-store";
import { backendFetch } from "@/lib/backend-fetch";

export function StepUpload() {
  const store = useProductStudioStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadingBottle, setUploadingBottle] = useState<number | null>(null);

  const uploadCSV = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await backendFetch("/api/v1/product-studio/upload-csv", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.success) {
          store.setCsvProducts(data.products);
          store.setCsvFileName(file.name);
          store.setSelectedProductIndices(data.products.map((_: unknown, i: number) => i));
          toast({ title: `${data.count} products loaded from CSV` });
        } else {
          toast({ title: "CSV error", description: data.detail || "Parse failed", variant: "destructive" });
        }
      } catch (e) {
        toast({ title: "Upload failed", description: String(e), variant: "destructive" });
      } finally {
        setUploading(false);
      }
    },
    [store, toast]
  );

  const uploadBottleImage = async (files: File[], productIndex: number) => {
    setUploadingBottle(productIndex);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const res = await backendFetch("/api/v1/product-studio/upload-bottle-images", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.urls?.length) {
        store.setBottleImage(productIndex, data.urls[0]);
      }
    } catch (e) {
      toast({ title: "Upload failed", description: String(e), variant: "destructive" });
    } finally {
      setUploadingBottle(null);
    }
  };

  const allSelected =
    store.csvProducts.length > 0 &&
    store.selectedProductIndices.length === store.csvProducts.length;

  return (
    <div className="space-y-4">
      {/* CSV Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="size-4" />
            Shopify CSV
          </CardTitle>
        </CardHeader>
        <CardContent>
          {store.csvFileName ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="size-4 text-green-600" />
                <span className="text-sm font-medium">{store.csvFileName}</span>
                <Badge variant="outline" className="text-xs">
                  {store.csvProducts.length} products
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  store.setCsvProducts([]);
                  store.setCsvFileName(null);
                  store.setSelectedProductIndices([]);
                }}
              >
                <X className="size-3" />
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed cursor-pointer hover:border-foreground/30 transition-colors">
              {uploading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Upload className="size-5 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">
                    Drop Shopify CSV or click to upload
                  </span>
                </>
              )}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadCSV(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </CardContent>
      </Card>

      {/* Product Table */}
      {store.csvProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                Products ({store.selectedProductIndices.length}/{store.csvProducts.length} selected)
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (allSelected ? store.deselectAllProducts() : store.selectAllProducts())}
              >
                {allSelected ? (
                  <><CheckSquare className="size-3 mr-1" />Deselect All</>
                ) : (
                  <><Square className="size-3 mr-1" />Select All</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y max-h-[400px] overflow-y-auto -mx-1 px-1">
              {store.csvProducts.map((product, idx) => {
                const isSelected = store.selectedProductIndices.includes(idx);
                const bottleUrl = store.bottleImages[idx];

                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <button
                      type="button"
                      onClick={() => store.toggleProductIndex(idx)}
                      className="flex-shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="size-4 text-foreground" />
                      ) : (
                        <Square className="size-4 text-muted-foreground" />
                      )}
                    </button>

                    {/* Bottle image */}
                    <div className="size-10 rounded border bg-muted flex-shrink-0 overflow-hidden">
                      {bottleUrl ? (
                        <div className="relative group size-full">
                          <img
                            src={bottleUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => store.removeBottleImage(idx)}
                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="size-3 text-white" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center size-full cursor-pointer hover:bg-muted/80">
                          {uploadingBottle === idx ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <ImageIcon className="size-3 text-muted-foreground" />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length) uploadBottleImage(files, idx);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {product.cleaned_name || product.perfume_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {product.brand_name && `${product.brand_name} · `}
                        {product.gender}
                      </p>
                    </div>

                    <Badge
                      variant={bottleUrl ? "default" : "outline"}
                      className="text-[10px] flex-shrink-0"
                    >
                      {bottleUrl ? "Image" : "No image"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
