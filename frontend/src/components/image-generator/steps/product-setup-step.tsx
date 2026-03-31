"use client";

import { useState, useCallback } from "react";
import { Upload, X, Loader2, Sparkles, Check, ChevronDown, Package, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useImageGeneratorStore } from "@/stores/image-generator-store";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ─── Upload helper ──────────────────────────────────────────────

async function uploadFiles(
  files: File[],
  endpoint: string,
): Promise<string[]> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const response = await fetch(`/api/image-generator/${endpoint}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) throw new Error("Upload failed");
  const data = await response.json();
  return data.urls ?? [];
}

// ─── Reusable Image Upload Section ──────────────────────────────

function ImageUploadSection({
  title,
  description,
  icon: Icon,
  images,
  onRemove,
  onFilesSelected,
  maxImages,
  uploadId,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  images: string[];
  onRemove: (url: string) => void;
  onFilesSelected: (files: File[]) => Promise<void>;
  maxImages: number;
  uploadId: string;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (images.length >= maxImages) {
        toast({
          title: "Maximum images reached",
          description: `You can upload up to ${maxImages} images.`,
          variant: "destructive",
        });
        return;
      }

      const validFiles = files.filter((file) => {
        const isImage = file.type.startsWith("image/");
        const isUnder10MB = file.size <= 10 * 1024 * 1024;
        if (!isImage) {
          toast({ title: "Invalid file", description: `${file.name} is not an image.`, variant: "destructive" });
        } else if (!isUnder10MB) {
          toast({ title: "File too large", description: `${file.name} exceeds 10MB.`, variant: "destructive" });
        }
        return isImage && isUnder10MB;
      });

      if (validFiles.length === 0) return;
      const toUpload = validFiles.slice(0, maxImages - images.length);

      setUploading(true);
      try {
        await onFilesSelected(toUpload);
      } finally {
        setUploading(false);
      }
    },
    [images.length, maxImages, onFilesSelected, toast]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Thumbnails */}
        {images.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {images.map((url, index) => (
              <div key={url} className="relative group aspect-square">
                <Image src={url} alt={`${title} ${index + 1}`} fill className="object-cover rounded-lg border" />
                <button
                  type="button"
                  onClick={() => onRemove(url)}
                  className="absolute -top-1.5 -right-1.5 p-0.5 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Drop zone */}
        {images.length < maxImages && (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
              dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            )}
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              setDragActive(false);
              await handleFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <input
              id={uploadId}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                if (e.target.files) await handleFiles(Array.from(e.target.files));
              }}
              disabled={uploading}
            />
            <label htmlFor={uploadId} className="cursor-pointer flex flex-col items-center gap-1">
              {uploading ? (
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="size-6 text-muted-foreground" />
              )}
              <p className="text-xs text-muted-foreground">
                {uploading ? "Uploading..." : `Drop or click (${images.length}/${maxImages})`}
              </p>
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export function ProductSetupStep() {
  const {
    productImages,
    addProductImages,
    removeProductImage,
    bottleImages,
    addBottleImages,
    removeBottleImage,
    boxImages,
    addBoxImages,
    removeBoxImage,
    productName,
    setProductName,
    brandName,
    setBrandName,
    liquidColor,
    setLiquidColor,
    productDNA,
    setProductDNA,
    analysisLoading,
    setAnalysisLoading,
  } = useImageGeneratorStore();

  const { toast } = useToast();
  const [dnaExpanded, setDnaExpanded] = useState(true);

  // ── Analyze Product ────────────────────────────────────────────

  const analyzeProduct = useCallback(async () => {
    // Use all available images for analysis
    const allImages = [...bottleImages, ...boxImages, ...productImages];
    if (allImages.length === 0) {
      toast({
        title: "No images",
        description: "Please upload at least one product image first.",
        variant: "destructive",
      });
      return;
    }

    setAnalysisLoading(true);
    try {
      const response = await fetch("/api/image-generator/analyze-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_urls: allImages,
          product_name: productName || undefined,
          brand_name: brandName || undefined,
        }),
      });

      if (!response.ok) throw new Error("Analysis failed");

      const data = await response.json();
      setProductDNA(data.product_dna);
      setDnaExpanded(true);

      toast({
        title: "Product analyzed",
        description: `Identified as: ${data.product_dna.product_type || "Product"}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analysis failed";
      toast({ title: "Analysis failed", description: message, variant: "destructive" });
    } finally {
      setAnalysisLoading(false);
    }
  }, [bottleImages, boxImages, productImages, productName, brandName, setProductDNA, setAnalysisLoading, toast]);

  // Total images for validation
  const totalImages = bottleImages.length + boxImages.length + productImages.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Product Setup</h2>
        <p className="text-muted-foreground">
          Upload your product images separately — bottle and box. This helps the AI
          know exactly which reference to use for each shot type.
        </p>
      </div>

      {/* Bottle Upload */}
      <ImageUploadSection
        title="Bottle Images"
        description="Upload clear photos of your bottle from different angles. These are the PRIMARY reference — the AI will clone this bottle's exact shape, cap, label, and glass."
        icon={Wine}
        images={bottleImages}
        onRemove={removeBottleImage}
        maxImages={5}
        uploadId="bottle-upload"
        onFilesSelected={async (files) => {
          const urls = await uploadFiles(files, "upload-bottle");
          addBottleImages(urls);
          toast({ title: "Uploaded", description: `${urls.length} bottle image${urls.length > 1 ? "s" : ""} added.` });
        }}
      />

      {/* Box Upload */}
      <ImageUploadSection
        title="Box / Packaging Images (Optional)"
        description="Upload your product's packaging box. Only used for the 'With Box' shot type. Skip if you don't need box shots."
        icon={Package}
        images={boxImages}
        onRemove={removeBoxImage}
        maxImages={3}
        uploadId="box-upload"
        onFilesSelected={async (files) => {
          const urls = await uploadFiles(files, "upload-box");
          addBoxImages(urls);
          toast({ title: "Uploaded", description: `${urls.length} box image${urls.length > 1 ? "s" : ""} added.` });
        }}
      />

      {/* Extra Product Images (optional, for DNA) */}
      <ImageUploadSection
        title="Additional Product Photos (Optional)"
        description="Extra angles, label close-ups, or lifestyle shots for better DNA analysis. These won't be used as direct references."
        icon={Upload}
        images={productImages}
        onRemove={removeProductImage}
        maxImages={5}
        uploadId="product-upload"
        onFilesSelected={async (files) => {
          const urls = await uploadFiles(files, "upload-product");
          addProductImages(urls);
          toast({ title: "Uploaded", description: `${urls.length} image${urls.length > 1 ? "s" : ""} added.` });
        }}
      />

      {/* Product Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Product Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ig-product-name">
              Product Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ig-product-name"
              placeholder="e.g., Tuscan Noir (the variant/fragrance name)"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This is the <strong>product/variant</strong> name that appears on the label (e.g., &quot;Tuscan Noir&quot;, &quot;Midnight Oud&quot;)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ig-brand-name">Brand Name</Label>
              <Input
                id="ig-brand-name"
                placeholder="e.g., Fuméra (the company/house name)"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The <strong>brand/company</strong> name and logo on the label (e.g., &quot;Fuméra&quot;)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ig-liquid-color">Liquid Color</Label>
              <Input
                id="ig-liquid-color"
                placeholder="e.g., light brown, amber, clear"
                value={liquidColor}
                onChange={(e) => setLiquidColor(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analyze Button */}
      {totalImages > 0 && !productDNA && (
        <Button
          onClick={analyzeProduct}
          disabled={analysisLoading || !productName.trim()}
          className="w-full"
          size="lg"
        >
          {analysisLoading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Analyzing Product...
            </>
          ) : (
            <>
              <Sparkles className="size-4 mr-2" />
              Analyze Product
            </>
          )}
        </Button>
      )}

      {/* Product DNA Display */}
      {productDNA && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader className="pb-3">
            <button
              type="button"
              onClick={() => setDnaExpanded(!dnaExpanded)}
              className="flex items-center justify-between w-full"
            >
              <CardTitle className="text-lg flex items-center gap-2">
                <Check className="size-5 text-green-500" />
                Product DNA Extracted
              </CardTitle>
              <ChevronDown
                className={cn(
                  "size-5 text-muted-foreground transition-transform",
                  dnaExpanded && "rotate-180"
                )}
              />
            </button>
          </CardHeader>

          {dnaExpanded && (
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                {productDNA.product_type && (
                  <div>
                    <span className="text-muted-foreground">Type:</span>{" "}
                    <span className="font-medium">{productDNA.product_type}</span>
                  </div>
                )}
                {productDNA.shape && (
                  <div>
                    <span className="text-muted-foreground">Shape:</span>{" "}
                    <span className="font-medium">{productDNA.shape}</span>
                  </div>
                )}
              </div>

              {productDNA.colors && (
                <div>
                  <span className="text-muted-foreground block mb-1.5">Colors:</span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(productDNA.colors)
                      .filter(([, value]) => value)
                      .map(([key, value]) => (
                        <Badge key={key} variant="secondary">
                          {key}: {value}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              {productDNA.materials && productDNA.materials.length > 0 && (
                <div>
                  <span className="text-muted-foreground block mb-1.5">Materials:</span>
                  <div className="flex flex-wrap gap-2">
                    {productDNA.materials.map((material) => (
                      <Badge key={material} variant="outline">
                        {material}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {productDNA.distinctive_features && productDNA.distinctive_features.length > 0 && (
                <div>
                  <span className="text-muted-foreground block mb-1.5">Distinctive Features:</span>
                  <ul className="list-disc list-inside space-y-0.5">
                    {productDNA.distinctive_features.map((feature, i) => (
                      <li key={i}>{feature}</li>
                    ))}
                  </ul>
                </div>
              )}

              {productDNA.visual_description && (
                <div>
                  <span className="text-muted-foreground block mb-1">Visual Description:</span>
                  <p className="text-foreground leading-relaxed">{productDNA.visual_description}</p>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={() => setProductDNA(null)}>
                <Sparkles className="size-3 mr-1.5" />
                Re-analyze
              </Button>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
