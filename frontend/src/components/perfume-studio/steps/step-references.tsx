"use client";

import { useState } from "react";
import { Loader2, ScanEye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { usePerfumeStudioStore } from "@/stores/perfume-studio-store";
import { ImageUploadSlot } from "../shared/image-upload-slot";
import { DNADisplay } from "../shared/dna-display";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export function StepReferences() {
  const store = usePerfumeStudioStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState<string | null>(null);

  const uploadImage = async (files: File[], type: "bottle" | "cap" | "label") => {
    setUploading(type);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/upload-references`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.urls?.length) {
        if (type === "bottle") store.setBottleImage(data.urls[0]);
        else if (type === "cap") store.setCapImage(data.urls[0]);
        else data.urls.forEach((url: string) => store.addLabelImage(url));
      }
    } catch (e) {
      toast({ title: "Upload failed", description: String(e), variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const extractProductDNA = async () => {
    const refs = store.getAllReferenceImages();
    if (refs.length === 0) {
      toast({ title: "No images", description: "Upload at least one reference image first", variant: "destructive" });
      return;
    }
    store.setIsExtractingProductDNA(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/extract-product-dna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_urls: refs }),
      });
      const data = await res.json();
      if (data.success) {
        store.setProductDNA(data.product_dna);
        toast({ title: "Product DNA extracted" });
      }
    } catch (e) {
      toast({ title: "DNA extraction failed", description: String(e), variant: "destructive" });
    } finally {
      store.setIsExtractingProductDNA(false);
    }
  };

  const hasRefs = store.bottleImage || store.capImage || store.labelImages.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reference Images</CardTitle>
          <p className="text-xs text-muted-foreground">Upload bottle, cap, and label images for the reference product</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ImageUploadSlot
              label="Bottle"
              imageUrl={store.bottleImage}
              onUpload={(f) => uploadImage(f, "bottle")}
              onRemove={() => store.setBottleImage(null)}
              uploading={uploading === "bottle"}
            />
            <ImageUploadSlot
              label="Cap"
              imageUrl={store.capImage}
              onUpload={(f) => uploadImage(f, "cap")}
              onRemove={() => store.setCapImage(null)}
              uploading={uploading === "cap"}
            />
            {store.labelImages.map((url, i) => (
              <ImageUploadSlot
                key={url}
                label={`Label ${i + 1}`}
                imageUrl={url}
                onUpload={() => {}}
                onRemove={() => store.removeLabelImage(url)}
                uploading={false}
              />
            ))}
            <ImageUploadSlot
              label="Add Label"
              imageUrl={null}
              onUpload={(f) => uploadImage(f, "label")}
              onRemove={() => {}}
              uploading={uploading === "label"}
              multiple
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Product DNA</CardTitle>
            <Button
              size="sm"
              onClick={extractProductDNA}
              disabled={!hasRefs || store.isExtractingProductDNA}
            >
              {store.isExtractingProductDNA ? (
                <><Loader2 className="size-3 animate-spin mr-1.5" />Extracting...</>
              ) : (
                <><ScanEye className="size-3 mr-1.5" />Extract DNA</>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {store.productDNA ? (
            <DNADisplay title="Product DNA" data={store.productDNA} color="violet" />
          ) : (
            <p className="text-xs text-muted-foreground">Upload reference images and extract Product DNA to continue</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
