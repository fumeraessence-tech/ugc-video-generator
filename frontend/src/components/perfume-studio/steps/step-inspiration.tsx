"use client";

import { useState, useCallback } from "react";
import { Loader2, Upload, X, Sparkles, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePerfumeStudioStore } from "@/stores/perfume-studio-store";
import { DNADisplay } from "../shared/dna-display";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export function StepInspiration() {
  const store = usePerfumeStudioStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const uploadImages = useCallback(async (files: File[]) => {
    setUploading(true);
    const batchSize = 15;
    const allUrls: string[] = [];

    try {
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        setUploadProgress(`Uploading ${i + 1}-${Math.min(i + batchSize, files.length)} of ${files.length}...`);

        const formData = new FormData();
        batch.forEach((f) => formData.append("files", f));

        const res = await fetch(`${BACKEND_URL}/api/v1/perfume/upload-inspiration`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.urls?.length) {
          allUrls.push(...data.urls);
        }
      }

      if (allUrls.length > 0) {
        store.addInspirationImages(allUrls);
        toast({ title: `${allUrls.length} inspiration images uploaded` });
      }
    } catch (e) {
      toast({ title: "Upload failed", description: String(e), variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }, [store, toast]);

  const analyzeInspiration = async () => {
    if (store.inspirationImages.length === 0) {
      toast({ title: "No images", description: "Upload inspiration images first", variant: "destructive" });
      return;
    }
    store.setIsAnalyzingInspiration(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/analyze-inspiration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_urls: store.inspirationImages,
          sample_size: 12,
        }),
      });
      const data = await res.json();
      if (data.success) {
        store.setInspirationDNA(data.inspiration_dna);
        toast({ title: "Inspiration analyzed successfully" });
      }
    } catch (e) {
      toast({ title: "Analysis failed", description: String(e), variant: "destructive" });
    } finally {
      store.setIsAnalyzingInspiration(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="size-4" />
                Inspiration Portfolio
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Upload 20-200+ perfume product photos to teach the AI your preferred style
              </p>
            </div>
            <Badge variant="outline">{store.inspirationImages.length} images</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {store.inspirationImages.length > 0 && (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 max-h-60 overflow-y-auto p-1">
              {store.inspirationImages.map((url) => (
                <div key={url} className="relative group aspect-square rounded overflow-hidden border">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => store.removeInspirationImage(url)}
                    className="absolute top-0 right-0 p-0.5 bg-destructive text-destructive-foreground rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="size-2" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
            {uploading ? (
              <div className="text-center">
                <Loader2 className="size-5 animate-spin text-primary mx-auto mb-1" />
                <span className="text-xs text-muted-foreground">{uploadProgress}</span>
              </div>
            ) : (
              <>
                <Upload className="size-5 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Drop images or click to upload (bulk)</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) uploadImages(files);
                e.target.value = "";
              }}
            />
          </label>

          <div className="flex items-center gap-2">
            <Button
              onClick={analyzeInspiration}
              disabled={store.inspirationImages.length === 0 || store.isAnalyzingInspiration}
              className="flex-1"
            >
              {store.isAnalyzingInspiration ? (
                <><Loader2 className="size-3 animate-spin mr-1.5" />Analyzing Style...</>
              ) : (
                <><Sparkles className="size-3 mr-1.5" />Analyze Style DNA</>
              )}
            </Button>
            {store.inspirationImages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { store.setInspirationImages([]); store.setInspirationDNA(null); }}
              >
                Clear All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {store.inspirationDNA && (
        <DNADisplay title="Inspiration Style DNA" data={store.inspirationDNA} color="amber" />
      )}
    </div>
  );
}
