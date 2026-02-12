"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Upload, X, Sparkles, Loader2, AlertCircle, Check, ImageIcon, Brain, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useMassGeneratorStore } from "@/stores/mass-generator-store";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { ProductDNA } from "@/types/mass-generator";
import { backendFetch } from "@/lib/backend-fetch";

// Analysis stages for progress tracking
type AnalysisStage = "idle" | "loading_images" | "analyzing" | "extracting" | "complete" | "error";

interface AnalysisProgress {
  stage: AnalysisStage;
  progress: number;
  message: string;
}

export function ProductStep() {
  const {
    productImages,
    setProductImages,
    productName,
    setProductName,
    brandName,
    setBrandName,
    productDNA,
    setProductDNA,
    isLoading,
    setLoading,
    error,
    setError,
    nextStep,
  } = useMassGeneratorStore();

  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress>({
    stage: "idle",
    progress: 0,
    message: "",
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer effect for elapsed time during analysis
  useEffect(() => {
    if (analysisProgress.stage !== "idle" && analysisProgress.stage !== "complete" && analysisProgress.stage !== "error") {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (analysisProgress.stage === "idle") {
        setElapsedTime(0);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [analysisProgress.stage]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (productImages.length >= 5) {
        toast({
          title: "Maximum images reached",
          description: "You can upload up to 5 product images.",
          variant: "destructive",
        });
        return;
      }

      const validFiles = files.filter((file) => {
        const isValid = file.type.startsWith("image/");
        const isUnder10MB = file.size <= 10 * 1024 * 1024;
        return isValid && isUnder10MB;
      });

      if (validFiles.length === 0) {
        toast({
          title: "Invalid files",
          description: "Please upload image files under 10MB.",
          variant: "destructive",
        });
        return;
      }

      setUploading(true);

      try {
        const formData = new FormData();
        validFiles.slice(0, 5 - productImages.length).forEach((file) => {
          formData.append("files", file);
        });

        const response = await fetch("/api/products/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) throw new Error("Upload failed");

        const data = await response.json();
        setProductImages([...productImages, ...data.urls]);
        // Reset DNA and progress when new images are uploaded
        setProductDNA(null);
        setAnalysisProgress({ stage: "idle", progress: 0, message: "" });

        toast({
          title: "Upload successful",
          description: `${data.urls.length} image(s) uploaded.`,
        });
      } catch {
        toast({
          title: "Upload failed",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    },
    [productImages, setProductImages, setProductDNA, toast]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      await handleFiles(files);
    },
    [handleFiles]
  );

  const handleInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files);
        await handleFiles(files);
      }
    },
    [handleFiles]
  );

  const removeImage = useCallback(
    (url: string) => {
      setProductImages(productImages.filter((img) => img !== url));
      setProductDNA(null);
      setAnalysisProgress({ stage: "idle", progress: 0, message: "" });
    },
    [productImages, setProductImages, setProductDNA]
  );

  const analyzeProduct = useCallback(async () => {
    if (productImages.length === 0) {
      setError("Please upload at least one product image.");
      return;
    }

    setLoading(true);
    setError(null);
    setElapsedTime(0);

    // Stage 1: Loading images
    setAnalysisProgress({
      stage: "loading_images",
      progress: 15,
      message: `Preparing ${productImages.length} image${productImages.length > 1 ? "s" : ""} for analysis...`,
    });

    try {
      // Small delay to show loading stage
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Stage 2: Analyzing with AI
      setAnalysisProgress({
        stage: "analyzing",
        progress: 40,
        message: "AI is analyzing product visuals...",
      });

      const response = await backendFetch(
        "/api/v1/mass-generator/analyze-product",
        {
          method: "POST",
          body: JSON.stringify({
            image_urls: productImages,
            product_name: productName || null,
            brand_name: brandName || null,
          }),
        }
      );

      // Stage 3: Extracting DNA
      setAnalysisProgress({
        stage: "extracting",
        progress: 80,
        message: "Extracting product DNA...",
      });

      const data = await response.json();

      if (!data.success || !data.product_dna) {
        throw new Error(data.error || "Analysis failed");
      }

      // Stage 4: Complete
      setAnalysisProgress({
        stage: "complete",
        progress: 100,
        message: "Analysis complete!",
      });

      setProductDNA(data.product_dna as ProductDNA);

      toast({
        title: "Product analyzed",
        description: `Identified as: ${data.product_dna.product_type}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analysis failed";
      setAnalysisProgress({
        stage: "error",
        progress: 0,
        message: message,
      });
      setError(message);
      toast({
        title: "Analysis failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [
    productImages,
    productName,
    brandName,
    setProductDNA,
    setLoading,
    setError,
    toast,
  ]);

  const canProceed = productDNA !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Product Setup</h2>
        <p className="text-muted-foreground">
          Upload product images and we'll analyze them to ensure perfect
          consistency across all generated content.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Image Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Product Images</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Uploaded Images */}
          {productImages.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {productImages.map((url, index) => (
                <div key={url} className="relative group aspect-square">
                  <Image
                    src={url}
                    alt={`Product ${index + 1}`}
                    fill
                    className="object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload Area */}
          {productImages.length < 5 && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                id="product-upload"
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleInputChange}
                disabled={uploading}
              />
              <label
                htmlFor="product-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                {uploading ? (
                  <Loader2 className="size-10 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="size-10 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">
                    {uploading
                      ? "Uploading..."
                      : "Drop images here or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Up to 5 images, max 10MB each
                  </p>
                </div>
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Product Information (Optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="product-name">Product Name</Label>
              <Input
                id="product-name"
                placeholder="e.g., Oud Royale Perfume"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-name">Brand Name</Label>
              <Input
                id="brand-name"
                placeholder="e.g., House of Scents"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analyze Button */}
      {!productDNA && productImages.length > 0 && analysisProgress.stage === "idle" && (
        <Button
          onClick={analyzeProduct}
          disabled={isLoading || productImages.length === 0}
          className="w-full"
          size="lg"
        >
          <Sparkles className="size-4 mr-2" />
          Analyze Product with AI
        </Button>
      )}

      {/* Analysis Progress Indicator */}
      {analysisProgress.stage !== "idle" && analysisProgress.stage !== "complete" && analysisProgress.stage !== "error" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 space-y-4">
            {/* Progress Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="size-5 text-primary animate-pulse" />
                <span className="font-medium">Analyzing Product</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, "0")}
              </span>
            </div>

            {/* Progress Bar */}
            <Progress value={analysisProgress.progress} className="h-2" />

            {/* Progress Stages */}
            <div className="flex justify-between text-xs">
              <div className={cn(
                "flex flex-col items-center gap-1 transition-colors",
                analysisProgress.stage === "loading_images" ? "text-primary" :
                ["analyzing", "extracting"].includes(analysisProgress.stage) ? "text-green-500" : "text-muted-foreground"
              )}>
                <div className={cn(
                  "size-6 rounded-full flex items-center justify-center border-2",
                  analysisProgress.stage === "loading_images" ? "border-primary bg-primary/20" :
                  ["analyzing", "extracting"].includes(analysisProgress.stage) ? "border-green-500 bg-green-500/20" : "border-muted"
                )}>
                  {["analyzing", "extracting"].includes(analysisProgress.stage) ? (
                    <Check className="size-3" />
                  ) : analysisProgress.stage === "loading_images" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <ImageIcon className="size-3" />
                  )}
                </div>
                <span>Load Images</span>
              </div>

              <div className={cn(
                "flex flex-col items-center gap-1 transition-colors",
                analysisProgress.stage === "analyzing" ? "text-primary" :
                analysisProgress.stage === "extracting" ? "text-green-500" : "text-muted-foreground"
              )}>
                <div className={cn(
                  "size-6 rounded-full flex items-center justify-center border-2",
                  analysisProgress.stage === "analyzing" ? "border-primary bg-primary/20" :
                  analysisProgress.stage === "extracting" ? "border-green-500 bg-green-500/20" : "border-muted"
                )}>
                  {analysisProgress.stage === "extracting" ? (
                    <Check className="size-3" />
                  ) : analysisProgress.stage === "analyzing" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Brain className="size-3" />
                  )}
                </div>
                <span>AI Analysis</span>
              </div>

              <div className={cn(
                "flex flex-col items-center gap-1 transition-colors",
                analysisProgress.stage === "extracting" ? "text-primary" : "text-muted-foreground"
              )}>
                <div className={cn(
                  "size-6 rounded-full flex items-center justify-center border-2",
                  analysisProgress.stage === "extracting" ? "border-primary bg-primary/20" : "border-muted"
                )}>
                  {analysisProgress.stage === "extracting" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <FileText className="size-3" />
                  )}
                </div>
                <span>Extract DNA</span>
              </div>
            </div>

            {/* Current Status Message */}
            <p className="text-sm text-center text-muted-foreground">
              {analysisProgress.message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Product DNA Display */}
      {productDNA && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="size-5 text-green-500" />
              Product DNA Extracted
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-muted-foreground">Type:</span>{" "}
                <span className="font-medium">{productDNA.product_type}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Shape:</span>{" "}
                <span className="font-medium">{productDNA.shape}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Primary Color:</span>{" "}
                <span className="font-medium">{productDNA.colors.primary}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Size:</span>{" "}
                <span className="font-medium">{productDNA.size_category}</span>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Materials:</span>{" "}
              <span className="font-medium">
                {productDNA.materials.join(", ")}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Description:</span>
              <p className="mt-1 text-foreground">
                {productDNA.visual_description}
              </p>
            </div>
            {productDNA.distinctive_features.length > 0 && (
              <div>
                <span className="text-muted-foreground">Key Features:</span>
                <ul className="mt-1 list-disc list-inside">
                  {productDNA.distinctive_features.map((feature, i) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProductDNA(null)}
              className="mt-2"
            >
              Re-analyze
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Next Button */}
      <div className="flex justify-end">
        <Button onClick={nextStep} disabled={!canProceed} size="lg">
          Next: Select Avatar
        </Button>
      </div>
    </div>
  );
}
