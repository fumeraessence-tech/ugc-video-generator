"use client";

import { Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePerfumeStudioStore } from "@/stores/perfume-studio-store";

export function StepConfigure() {
  const store = usePerfumeStudioStore();

  const selectedCount = store.selectedProductIndices.length || store.csvProducts.length;
  const totalImages = selectedCount * store.imagesPerProduct;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="size-4" />
            Generation Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm">Images Per Product</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={4}
                max={12}
                value={store.imagesPerProduct}
                onChange={(e) => store.setImagesPerProduct(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <Badge variant="secondary" className="text-sm font-mono w-8 justify-center">
                {store.imagesPerProduct}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Each product will get {store.imagesPerProduct} unique styled images (white bg, lifestyle, model shots, etc.)
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Aspect Ratio</Label>
            <Select value={store.aspectRatio} onValueChange={store.setAspectRatio}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1:1">1:1 Square</SelectItem>
                <SelectItem value="4:3">4:3 Landscape</SelectItem>
                <SelectItem value="3:4">3:4 Portrait</SelectItem>
                <SelectItem value="16:9">16:9 Wide</SelectItem>
                <SelectItem value="9:16">9:16 Tall</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Generation Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-1">
              <p className="text-2xl font-bold text-primary">{selectedCount}</p>
              <p className="text-xs text-muted-foreground">Products</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-primary">{store.imagesPerProduct}</p>
              <p className="text-xs text-muted-foreground">Images Each</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-primary">{totalImages}</p>
              <p className="text-xs text-muted-foreground">Total Images</p>
            </div>
          </div>

          <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <p>Reference images: {store.getAllReferenceImages().length}</p>
            <p>Product DNA: {store.productDNA ? "Extracted" : "Not extracted"}</p>
            <p>Male avatar: {store.maleAvatar.images.length} images {store.maleAvatar.dna ? "(DNA ready)" : ""}</p>
            <p>Female avatar: {store.femaleAvatar.images.length} images {store.femaleAvatar.dna ? "(DNA ready)" : ""}</p>
            <p>Unisex avatar: {store.unisexAvatar.images.length} images {store.unisexAvatar.dna ? "(DNA ready)" : ""}</p>
            <p>Inspiration: {store.inspirationImages.length} images {store.inspirationDNA ? "(Style DNA ready)" : ""}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
