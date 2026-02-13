"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Check,
  Copy,
  Download,
  Eye,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  Video,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMassGeneratorStore } from "@/stores/mass-generator-store";
import { backendFetch } from "@/lib/backend-fetch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
// Using native img for dynamically generated storyboard images
// Next.js Image component has issues with runtime-generated local images

interface StoryboardVariant {
  image_url: string;
  generated_at: number;
}

interface StoryboardScene {
  scene_number: string;
  image_url: string;
  prompt: string;
  variants: StoryboardVariant[];
  selectedVariantIndex: number;
}

type GenerationPhase = "idle" | "storyboard" | "audio" | "video" | "complete";

interface GenerationProgress {
  phase: GenerationPhase;
  currentScene: number;
  totalScenes: number;
  message: string;
}

export function GenerateStep() {
  const {
    script,
    setScript,
    productionBible,
    productDNA,
    productImages,
    productName,
    creativeBrief,
    avatarDNA,
    avatarReferenceImages,
    platform,
    style,
    duration,
    error,
    setError,
    prevStep,
    reset,
  } = useMassGeneratorStore();

  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress>({
    phase: "idle",
    currentScene: 0,
    totalScenes: 0,
    message: "",
  });
  const [generatedAssets, setGeneratedAssets] = useState<{
    storyboards: StoryboardScene[];
    audioUrl: string | null;
    videoUrl: string | null;
  }>({
    storyboards: [],
    audioUrl: null,
    videoUrl: null,
  });
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [previewScene, setPreviewScene] = useState<StoryboardScene | null>(null);
  const [regeneratingScenes, setRegeneratingScenes] = useState<Set<number>>(new Set());

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  // Regenerate a single scene storyboard
  const regenerateScene = async (sceneIndex: number) => {
    if (!script || !productionBible || !productDNA) return;

    const scene = script.scenes[sceneIndex];
    if (!scene) return;

    // Mark scene as regenerating
    setRegeneratingScenes((prev) => new Set(prev).add(sceneIndex));

    try {
      // Build the single scene script for backend
      const singleSceneScript = transformScriptForBackend(
        { ...script, scenes: [scene] },
        productionBible,
        productDNA
      );
      // Fix scene number to be 1 for single scene generation
      singleSceneScript.scenes[0].scene_number = 1;

      // Map platform to aspect ratio
      const platformToAspectRatio: Record<string, string> = {
        instagram_reels: "9:16",
        tiktok: "9:16",
        youtube_shorts: "9:16",
        youtube_long: "16:9",
        youtube: "16:9",
        instagram_feed: "4:5",
        facebook: "1:1",
        meta_ads: "9:16",
        pinterest: "9:16",
        snapchat: "9:16",
      };
      const aspectRatio = platformToAspectRatio[platform] || "9:16";

      const response = await backendFetch(
        "/api/v1/storyboard/generate",
        {
          method: "POST",
          body: JSON.stringify({
            script: singleSceneScript,
            avatar_data: avatarDNA ? { dna: avatarDNA } : null,
            avatar_reference_images: avatarReferenceImages || [],
            product_images: productImages || [],
            product_name: productName || productDNA?.product_name || undefined,
            aspect_ratio: aspectRatio,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle FastAPI validation errors (detail is array of objects)
        let errorMessage = `Server error: ${response.status}`;
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            errorMessage = errorData.detail
              .map((e: { msg?: string; loc?: string[] }) => e.msg || JSON.stringify(e))
              .join("; ");
          } else if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          } else {
            errorMessage = JSON.stringify(errorData.detail);
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.storyboard?.scenes?.[0]) {
        const newScene = data.storyboard.scenes[0];
        const timestamp = Date.now();
        let imageUrl = newScene.image_url || "";
        if (imageUrl && !imageUrl.includes("?") && !imageUrl.includes("placehold")) {
          imageUrl = `${imageUrl}?t=${timestamp}`;
        }

        // Add new variant to the scene
        setGeneratedAssets((prev) => {
          const updatedStoryboards = [...prev.storyboards];
          const currentScene = updatedStoryboards[sceneIndex];
          if (currentScene) {
            const newVariant = { image_url: imageUrl, generated_at: timestamp };
            updatedStoryboards[sceneIndex] = {
              ...currentScene,
              variants: [...currentScene.variants, newVariant],
              selectedVariantIndex: currentScene.variants.length, // Select the new one
              image_url: imageUrl, // Update main image_url to selected
            };
          }
          return { ...prev, storyboards: updatedStoryboards };
        });

        toast({
          title: "Scene Regenerated!",
          description: `Scene ${sceneIndex + 1} has a new variant`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Regeneration failed";
      toast({
        title: "Regeneration Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRegeneratingScenes((prev) => {
        const next = new Set(prev);
        next.delete(sceneIndex);
        return next;
      });
    }
  };

  // Select a variant for a scene
  const selectVariant = (sceneIndex: number, variantIndex: number) => {
    setGeneratedAssets((prev) => {
      const updatedStoryboards = [...prev.storyboards];
      const currentScene = updatedStoryboards[sceneIndex];
      if (currentScene && currentScene.variants[variantIndex]) {
        updatedStoryboards[sceneIndex] = {
          ...currentScene,
          selectedVariantIndex: variantIndex,
          image_url: currentScene.variants[variantIndex].image_url,
        };
      }
      return { ...prev, storyboards: updatedStoryboards };
    });

    // Also update the script with the selected storyboard URL
    if (script) {
      const updatedScenes = script.scenes.map((scene, i) => {
        if (i === sceneIndex) {
          const variant = generatedAssets.storyboards[sceneIndex]?.variants[variantIndex];
          return { ...scene, storyboard_url: variant?.image_url };
        }
        return scene;
      });
      setScript({ ...script, scenes: updatedScenes });
    }
  };

  const generateStoryboard = async () => {
    if (!script || !productionBible || !productDNA) {
      setError("Missing required data. Please go back and complete all steps.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedAssets({ storyboards: [], audioUrl: null, videoUrl: null });

    const totalScenes = script.scenes.length;

    try {
      setProgress({
        phase: "storyboard",
        currentScene: 0,
        totalScenes,
        message: "Starting storyboard generation...",
      });

      // Transform frontend script to backend schema format
      const backendScript = transformScriptForBackend(script, productionBible, productDNA);

      setProgress({
        phase: "storyboard",
        currentScene: 1,
        totalScenes,
        message: "Generating all storyboard images...",
      });

      // Map platform to aspect ratio
      const platformToAspectRatio: Record<string, string> = {
        instagram_reels: "9:16",
        tiktok: "9:16",
        youtube_shorts: "9:16",
        youtube_long: "16:9",
        youtube: "16:9",
        instagram_feed: "4:5",
        facebook: "1:1",
        meta_ads: "9:16",
        pinterest: "9:16",
        snapchat: "9:16",
      };
      const aspectRatio = platformToAspectRatio[platform] || "9:16";

      // Call the correct backend endpoint with product images, avatar DNA, and reference images
      const response = await backendFetch(
        "/api/v1/storyboard/generate",
        {
          method: "POST",
          body: JSON.stringify({
            script: backendScript,
            avatar_data: avatarDNA ? { dna: avatarDNA } : null,
            avatar_reference_images: avatarReferenceImages || [],
            product_images: productImages || [],
            product_name: productName || productDNA?.product_name || undefined,
            product_dna: productDNA || undefined,
            aspect_ratio: aspectRatio,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle FastAPI validation errors (detail is array of objects)
        let errorMessage = `Server error: ${response.status}`;
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            // Extract messages from validation errors
            errorMessage = errorData.detail
              .map((e: { msg?: string; loc?: string[] }) => e.msg || JSON.stringify(e))
              .join("; ");
          } else if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          } else {
            errorMessage = JSON.stringify(errorData.detail);
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("Storyboard API response:", JSON.stringify(data, null, 2));

      if (data.storyboard?.scenes) {
        // Extract full scene data with prompts, add cache-busting timestamp
        const timestamp = Date.now();
        console.log("Raw storyboard scenes:", JSON.stringify(data.storyboard.scenes, null, 2));

        const storyboards: StoryboardScene[] = data.storyboard.scenes
          .map((s: { scene_number?: string; image_url?: string; prompt?: string }) => {
            // Ensure URL starts with / and add cache-bust
            let imageUrl = s.image_url || "";
            if (imageUrl && !imageUrl.includes("?") && !imageUrl.includes("placehold")) {
              imageUrl = `${imageUrl}?t=${timestamp}`;
            }
            console.log(`Scene ${s.scene_number} image_url:`, imageUrl);
            return {
              scene_number: s.scene_number || "1",
              image_url: imageUrl,
              prompt: s.prompt || "",
              variants: [{ image_url: imageUrl, generated_at: timestamp }],
              selectedVariantIndex: 0,
            };
          })
          // Only filter out completely empty URLs, keep placeholders for debugging
          .filter((s: StoryboardScene) => s.image_url && s.image_url.trim() !== "");

        console.log("Processed storyboards:", storyboards.length, storyboards.map(s => ({ scene: s.scene_number, url: s.image_url?.substring(0, 50) })));
        setGeneratedAssets((prev) => ({ ...prev, storyboards }));

        // Update script with storyboard URLs
        const updatedScenes = script.scenes.map((scene, i) => ({
          ...scene,
          storyboard_url: data.storyboard.scenes[i]?.image_url,
        }));
        setScript({ ...script, scenes: updatedScenes });

        toast({
          title: "Storyboards Generated!",
          description: `Successfully created ${storyboards.length} storyboard images`,
        });
      }

      setProgress({
        phase: "complete",
        currentScene: totalScenes,
        totalScenes,
        message: "Storyboard generation complete!",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setError(message);
      toast({
        title: "Generation Failed",
        description: message,
        variant: "destructive",
      });
      setProgress({
        phase: "idle",
        currentScene: 0,
        totalScenes: 0,
        message: "",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const progressPercent =
    progress.totalScenes > 0
      ? Math.round((progress.currentScene / progress.totalScenes) * 100)
      : 0;

  // Build the full prompt for preview
  const getFullPrompt = () => {
    if (!productionBible) return "";
    return productionBible.master_prompt;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Generate Content</h2>
        <p className="text-muted-foreground">
          Review your configuration and generate storyboard images.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Configuration Summary */}
      <Collapsible open={showSummary} onOpenChange={setShowSummary}>
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="size-4" />
                  Configuration Summary
                </CardTitle>
                {showSummary ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Product DNA Summary */}
              {productDNA && (
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">Product DNA</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1"
                      onClick={() =>
                        copyToClipboard(
                          productDNA.visual_description,
                          "Product description"
                        )
                      }
                    >
                      <Copy className="size-3" />
                      Copy
                    </Button>
                  </div>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">Type:</span>{" "}
                      {productDNA.product_type}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Colors:</span>{" "}
                      {productDNA.colors.primary}
                      {productDNA.colors.secondary && `, ${productDNA.colors.secondary}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {productDNA.visual_description}
                    </p>
                  </div>
                </div>
              )}

              {/* Avatar DNA Summary */}
              {avatarDNA && (
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">Character DNA</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1"
                      onClick={() =>
                        copyToClipboard(
                          `Face: ${avatarDNA.face}\nSkin: ${avatarDNA.skin}\nEyes: ${avatarDNA.eyes}\nHair: ${avatarDNA.hair}`,
                          "Character DNA"
                        )
                      }
                    >
                      <Copy className="size-3" />
                      Copy
                    </Button>
                  </div>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">Face:</span>{" "}
                      {avatarDNA.face}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Hair:</span>{" "}
                      {avatarDNA.hair}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Wardrobe:</span>{" "}
                      {avatarDNA.wardrobe}
                    </p>
                  </div>
                </div>
              )}

              {/* Creative Brief Summary */}
              {creativeBrief && (
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">Creative Brief</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1"
                      onClick={() =>
                        copyToClipboard(
                          `Hook: ${creativeBrief.hook_strategy}\nPain Point: ${creativeBrief.pain_point}\nCTA: ${creativeBrief.cta_approach}`,
                          "Creative brief"
                        )
                      }
                    >
                      <Copy className="size-3" />
                      Copy
                    </Button>
                  </div>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">Hook:</span>{" "}
                      {creativeBrief.hook_strategy}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Key Points:</span>{" "}
                      {creativeBrief.key_selling_points.join(", ")}
                    </p>
                  </div>
                </div>
              )}

              {/* Reference Images */}
              {(productImages.length > 0 || avatarReferenceImages.length > 0) && (
                <div className="border rounded-lg p-3">
                  <h4 className="font-medium text-sm mb-2">Reference Images</h4>
                  <div className="space-y-3">
                    {productImages.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Product ({productImages.length} image{productImages.length !== 1 ? "s" : ""})
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {productImages.map((img, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={img}
                              alt={`Product ${i + 1}`}
                              className="w-16 h-16 rounded object-cover border shrink-0"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {avatarReferenceImages.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Avatar ({avatarReferenceImages.length} image{avatarReferenceImages.length !== 1 ? "s" : ""})
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {avatarReferenceImages.map((img, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={img}
                              alt={`Avatar ref ${i + 1}`}
                              className="w-16 h-16 rounded object-cover border shrink-0"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Style Settings */}
              <div className="border rounded-lg p-3">
                <h4 className="font-medium text-sm mb-2">Style Settings</h4>
                <div className="text-sm grid grid-cols-2 gap-2">
                  <p>
                    <span className="text-muted-foreground">Platform:</span>{" "}
                    {platform}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Style:</span> {style}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Duration:</span>{" "}
                    {duration}s
                  </p>
                  <p>
                    <span className="text-muted-foreground">Scenes:</span>{" "}
                    {script?.scenes.length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Script Preview with Copy */}
      {script && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Script ({script.scenes.length} scenes)</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  const scriptText = script.scenes
                    .map(
                      (s, i) =>
                        `Scene ${i + 1} (${s.scene_type}):\n"${s.dialogue}"\nAction: ${s.action}`
                    )
                    .join("\n\n");
                  copyToClipboard(scriptText, "Full script");
                }}
              >
                <Copy className="size-3" />
                Copy All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {script.scenes.map((scene, i) => (
                <div
                  key={scene.scene_number}
                  className="flex items-start gap-3 p-2 rounded bg-muted/50 group"
                >
                  <span className="text-xs font-mono text-muted-foreground min-w-[3rem]">
                    {scene.scene_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">"{scene.dialogue}"</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {scene.action}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() =>
                      copyToClipboard(
                        `"${scene.dialogue}"\nAction: ${scene.action}\nCamera: ${scene.camera.shot_type}, ${scene.camera.angle}`,
                        `Scene ${i + 1}`
                      )
                    }
                  >
                    <Copy className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Master Prompt Preview */}
      <Collapsible open={showPromptPreview} onOpenChange={setShowPromptPreview}>
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <CardTitle className="text-sm text-muted-foreground">
                  View Master Prompt (Production Bible)
                </CardTitle>
                {showPromptPreview ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="relative">
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                  {getFullPrompt() || "Production Bible will be generated..."}
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2 gap-1"
                  onClick={() => copyToClipboard(getFullPrompt(), "Master prompt")}
                >
                  <Copy className="size-3" />
                  Copy
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Generation Progress */}
      {isGenerating && (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span className="font-medium">{progress.message}</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  Scene {progress.currentScene} of {progress.totalScenes}
                </span>
                <span>{progressPercent}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Storyboards Preview */}
      {generatedAssets.storyboards.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Check className="size-4 text-green-500" />
              Generated Storyboards ({generatedAssets.storyboards.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {generatedAssets.storyboards.map((scene, i) => {
                const isRegenerating = regeneratingScenes.has(i);
                const hasMultipleVariants = scene.variants.length > 1;

                return (
                  <div key={i} className="space-y-2">
                    {/* Image Container */}
                    <div
                      className={cn(
                        "aspect-[9/16] relative rounded-lg overflow-hidden group cursor-pointer border-2",
                        hasMultipleVariants ? "border-primary/50" : "border-transparent"
                      )}
                      onClick={() => setPreviewScene(scene)}
                    >
                      {/* Loading overlay when regenerating */}
                      {isRegenerating && (
                        <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center">
                          <Loader2 className="size-6 animate-spin text-white" />
                        </div>
                      )}

                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={scene.image_url}
                        alt={`Scene ${i + 1}`}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          console.error(`Failed to load image: ${scene.image_url}`);
                          const target = e.target as HTMLImageElement;
                          if (!target.src.startsWith('http')) {
                            target.src = `${window.location.origin}${scene.image_url}`;
                          }
                        }}
                        onLoad={() => console.log(`Loaded image: ${scene.image_url}`)}
                      />

                      {/* Hover overlay with actions */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewScene(scene);
                          }}
                        >
                          <ZoomIn className="size-3" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            const link = document.createElement("a");
                            link.href = scene.image_url;
                            link.download = `storyboard-scene-${i + 1}.png`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            toast({ title: "Download started", description: `Scene ${i + 1} image` });
                          }}
                        >
                          <Download className="size-3" />
                        </Button>
                      </div>

                      {/* Scene number badge */}
                      <span className="absolute top-1 left-1 text-xs text-white bg-black/60 px-1.5 py-0.5 rounded">
                        Scene {i + 1}
                      </span>

                      {/* Variant indicator */}
                      {hasMultipleVariants && (
                        <span className="absolute top-1 right-1 text-xs text-white bg-primary/80 px-1.5 py-0.5 rounded">
                          {scene.selectedVariantIndex + 1}/{scene.variants.length}
                        </span>
                      )}
                    </div>

                    {/* Variant Navigation (if multiple variants) */}
                    {hasMultipleVariants && (
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-6"
                          disabled={scene.selectedVariantIndex === 0}
                          onClick={() => selectVariant(i, scene.selectedVariantIndex - 1)}
                        >
                          <ChevronLeft className="size-3" />
                        </Button>
                        <div className="flex gap-1">
                          {scene.variants.map((_, vIndex) => (
                            <button
                              key={vIndex}
                              className={cn(
                                "size-2 rounded-full transition-colors",
                                vIndex === scene.selectedVariantIndex
                                  ? "bg-primary"
                                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                              )}
                              onClick={() => selectVariant(i, vIndex)}
                            />
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-6"
                          disabled={scene.selectedVariantIndex === scene.variants.length - 1}
                          onClick={() => selectVariant(i, scene.selectedVariantIndex + 1)}
                        >
                          <ChevronRight className="size-3" />
                        </Button>
                      </div>
                    )}

                    {/* Regenerate Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1"
                      disabled={isRegenerating || isGenerating}
                      onClick={() => regenerateScene(i)}
                    >
                      {isRegenerating ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="size-3" />
                          Regenerate
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Modal */}
      <Dialog open={!!previewScene} onOpenChange={(open) => !open && setPreviewScene(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Scene {previewScene?.scene_number} Preview</span>
              <div className="flex items-center gap-2">
                {previewScene && previewScene.variants.length > 1 && (
                  <span className="text-sm text-muted-foreground">
                    Variant {previewScene.selectedVariantIndex + 1} of {previewScene.variants.length}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (previewScene) {
                      const link = document.createElement("a");
                      link.href = previewScene.image_url;
                      link.download = `storyboard-scene-${previewScene.scene_number}.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      toast({ title: "Download started" });
                    }
                  }}
                >
                  <Download className="size-4 mr-2" />
                  Download
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          {previewScene && (
            <div className="space-y-4">
              <div className="relative aspect-[9/16] max-h-[50vh] w-auto mx-auto rounded-lg overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewScene.image_url}
                  alt={`Scene ${previewScene.scene_number}`}
                  className="absolute inset-0 w-full h-full object-contain"
                  onError={(e) => {
                    console.error(`Preview failed to load: ${previewScene.image_url}`);
                    const target = e.target as HTMLImageElement;
                    if (!target.src.startsWith('http')) {
                      target.src = `${window.location.origin}${previewScene.image_url}`;
                    }
                  }}
                />
              </div>

              {/* Variant thumbnails */}
              {previewScene.variants.length > 1 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">All Variants</h4>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {previewScene.variants.map((variant, vIndex) => {
                      const sceneIndex = generatedAssets.storyboards.findIndex(
                        (s) => s.scene_number === previewScene.scene_number
                      );
                      return (
                        <button
                          key={vIndex}
                          className={cn(
                            "relative aspect-[9/16] w-16 flex-shrink-0 rounded overflow-hidden border-2 transition-colors",
                            vIndex === previewScene.selectedVariantIndex
                              ? "border-primary"
                              : "border-transparent hover:border-muted-foreground"
                          )}
                          onClick={() => {
                            if (sceneIndex >= 0) {
                              selectVariant(sceneIndex, vIndex);
                              // Update preview scene to show selected variant
                              const updatedScene = {
                                ...previewScene,
                                selectedVariantIndex: vIndex,
                                image_url: variant.image_url,
                              };
                              setPreviewScene(updatedScene);
                            }
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={variant.image_url}
                            alt={`Variant ${vIndex + 1}`}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <span className="absolute bottom-0 left-0 right-0 text-[10px] text-white bg-black/60 text-center">
                            {vIndex + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Regenerate button in modal */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isGenerating || regeneratingScenes.has(
                    generatedAssets.storyboards.findIndex((s) => s.scene_number === previewScene.scene_number)
                  )}
                  onClick={() => {
                    const sceneIndex = generatedAssets.storyboards.findIndex(
                      (s) => s.scene_number === previewScene.scene_number
                    );
                    if (sceneIndex >= 0) {
                      regenerateScene(sceneIndex);
                    }
                  }}
                >
                  <RefreshCw className="size-4 mr-2" />
                  Regenerate This Scene
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">Imagen Prompt</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(previewScene.prompt, "Prompt")}
                  >
                    <Copy className="size-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {previewScene.prompt || "No prompt available"}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate Button - show if not generating and no storyboards yet */}
      {!isGenerating && generatedAssets.storyboards.length === 0 && (
        <Button
          onClick={generateStoryboard}
          disabled={!script || script.scenes.length === 0}
          size="lg"
          className="w-full"
        >
          <Sparkles className="size-4 mr-2" />
          Generate Storyboard Images
        </Button>
      )}

      {/* Complete Actions - only show when storyboards exist */}
      {generatedAssets.storyboards.length > 0 && !isGenerating && (
        <div className="space-y-4">
          <Button
            onClick={() => useMassGeneratorStore.getState().nextStep()}
            size="lg"
            className="w-full"
          >
            <Video className="size-4 mr-2" />
            Next: Generate Videos
          </Button>
          <div className="flex gap-4">
            <Button variant="outline" onClick={reset} className="flex-1">
              Start New Project
            </Button>
            <Button
              onClick={generateStoryboard}
              variant="outline"
              className="flex-1"
            >
              <Sparkles className="size-4 mr-2" />
              Regenerate Storyboards
            </Button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep} disabled={isGenerating}>
          Back
        </Button>
      </div>
    </div>
  );
}

// Helper function to transform frontend Script to backend Schema format
// This must produce valid ScriptScene objects for the backend Pydantic model
function transformScriptForBackend(
  script: {
    title: string;
    total_duration: number;
    scenes: Array<{
      scene_number: string;
      scene_type: string;
      duration_seconds: number;
      dialogue: string;
      action: string;
      expression: string;
      product_visibility: string;
      product_action: string;
      camera: { shot_type: string; angle: string; movement: string; focus: string };
      lighting: { setup: string; mood: string };
    }>;
  },
  bible: {
    camera_language: { body: string; lens_mm: number };
    lighting_bible: { color_temp_kelvin: number; key_intensity: string; fill_ratio: string; rim_light: boolean };
    style_config: { platform: string };
  } | null,
  productDNA: { visual_description: string } | null
) {
  // Map frontend scene types to backend enum values (must match SceneType enum)
  const sceneTypeMap: Record<string, string> = {
    hook: "hook",
    problem: "problem",
    solution: "solution",
    demo: "demonstration",
    demonstration: "demonstration",
    social_proof: "testimonial",
    testimonial: "testimonial",
    cta: "cta",
    intro: "intro",
    unboxing: "unboxing",
    application: "application",
  };

  // Map product visibility to backend enum (must match ProductVisibility enum)
  const visibilityMap: Record<string, string> = {
    none: "none",
    subtle: "background",
    background: "background",
    prominent: "secondary",
    secondary: "secondary",
    hero: "primary",
    primary: "primary",
  };

  // Debug: log the raw script data
  console.log("Raw script scenes:", JSON.stringify(script.scenes, null, 2));

  const transformedScenes = script.scenes.map((scene, idx) => {
    // Handle field name differences between backend script generation and frontend types
    // Backend Gemini sends: character_action, character_expression
    // Frontend type uses: action, expression
    const sceneAny = scene as Record<string, unknown>;

    // REQUIRED FIELDS - must have valid values
    // scene_number: int (REQUIRED)
    const sceneNumber = idx + 1;

    // dialogue: str (REQUIRED) - can be empty string but must exist
    const dialogue = String(scene.dialogue || sceneAny.dialogue || "");

    // location: str (REQUIRED)
    const location = String(sceneAny.location || "Modern interior setting");

    // description: str (REQUIRED) - use action as description
    const action = String(
      scene.action ||
      sceneAny.character_action ||
      sceneAny.action ||
      scene.dialogue ||
      "Character in scene"
    );

    // word_count: int (REQUIRED)
    const wordCount = dialogue.trim() ? dialogue.trim().split(/\s+/).length : 0;

    // duration_seconds: float (REQUIRED)
    const duration = typeof scene.duration_seconds === 'number' && scene.duration_seconds > 0
      ? scene.duration_seconds
      : 5;

    // Expression for visual description
    const expression = String(
      scene.expression ||
      sceneAny.character_expression ||
      sceneAny.expression ||
      "neutral"
    );

    // scene_type: SceneType enum (has default but we should set it correctly)
    const rawSceneType = String(scene.scene_type || sceneAny.scene_type || "demo");
    const sceneType = sceneTypeMap[rawSceneType] || "demonstration";

    // product_visibility: ProductVisibility enum
    const rawVisibility = String(scene.product_visibility || sceneAny.product_visibility || "none");
    const productVisibility = visibilityMap[rawVisibility] || "none";

    // Build camera_setup with all required fields
    const cameraSetup = {
      body: bible?.camera_language?.body || "ARRI Alexa Mini",
      lens: `${bible?.camera_language?.lens_mm || 35}mm f/1.8`,
      shot_type: scene.camera?.shot_type || "medium_close_up",
      angle: scene.camera?.angle || "eye_level",
      movement: scene.camera?.movement || "static",
      focus: scene.camera?.focus || "subject",
    };

    // Build lighting_setup with all required fields
    const lightingSetup = {
      type: scene.lighting?.setup || "three_point",
      direction: "front_45",
      color_temp: bible?.lighting_bible?.color_temp_kelvin || 5600,
      key_intensity: bible?.lighting_bible?.key_intensity || "soft",
      fill_intensity: bible?.lighting_bible?.fill_ratio || "low",
      rim_intensity: bible?.lighting_bible?.rim_light ? "medium" : "none",
    };

    const transformedScene = {
      // REQUIRED fields (no defaults in backend)
      scene_number: sceneNumber,
      location: location,
      description: action,
      dialogue: dialogue,
      word_count: wordCount,
      duration_seconds: duration,
      // Fields with defaults but we set them explicitly
      scene_type: sceneType,
      visual_description: buildScenePrompt({ ...scene, action, expression }, bible, productDNA),
      character_action: `${action}. Expression: ${expression}`,
      camera_setup: cameraSetup,
      lighting_setup: lightingSetup,
      product_visibility: productVisibility,
      background_setting: "modern_bedroom",
      camera_notes: `${cameraSetup.shot_type.replace(/_/g, " ")} shot, ${scene.lighting?.mood || "natural"} mood`,
    };

    return transformedScene;
  });

  // Debug: log the transformed scenes
  console.log("Transformed scenes for backend:", JSON.stringify(transformedScenes, null, 2));

  const result = {
    title: script.title || "Untitled Script",
    scenes: transformedScenes,
    total_duration: script.total_duration || transformedScenes.reduce((sum, s) => sum + s.duration_seconds, 0),
    total_words: transformedScenes.reduce((sum, s) => sum + s.word_count, 0),
    style_notes: `${bible?.style_config?.platform || "instagram_reels"} style, authentic UGC aesthetic`,
  };

  console.log("Final script payload:", JSON.stringify(result, null, 2));
  return result;
}

// Helper function to build scene prompt from production bible
function buildScenePrompt(
  scene: {
    dialogue: string;
    action: string;
    expression: string;
    product_visibility: string;
    product_action: string;
    camera: { shot_type: string; angle: string; movement: string };
    lighting: { setup: string; mood: string };
    scene_type: string;
  },
  bible: {
    camera_language?: { body: string };
    lighting_bible?: { color_temp_kelvin: number };
    avatar_dna?: { face: string; skin: string; eyes: string; hair: string; wardrobe: string } | null;
    realism_rules?: {
      skin_texture: string;
      face_structure: string;
      hands: string;
      environment: string;
      skin_prohibited: string;
      hands_prohibited: string;
      text_overlay: string;
    };
  } | null,
  productDNA: { visual_description: string } | null
): string {
  const parts: string[] = [];

  // Safely access nested properties with defaults
  const shotType = scene.camera?.shot_type || "medium_close_up";
  const cameraAngle = scene.camera?.angle || "eye_level";
  const cameraMovement = scene.camera?.movement || "static";
  const lightingSetup = scene.lighting?.setup || "natural_window";
  const lightingMood = scene.lighting?.mood || "warm";

  // Scene description
  parts.push(`Generate a photorealistic vertical (9:16) video frame.`);
  parts.push(``);
  parts.push(`SCENE: ${scene.dialogue || "Scene dialogue"}`);
  parts.push(`ACTION: ${scene.action || "Character action"}`);
  parts.push(`EXPRESSION: ${scene.expression || "natural"}`);
  parts.push(``);

  // Camera
  parts.push(`CAMERA:`);
  parts.push(`  Shot: ${shotType.replace(/_/g, " ")}`);
  parts.push(`  Angle: ${cameraAngle.replace(/_/g, " ")}`);
  parts.push(`  Movement: ${cameraMovement.replace(/_/g, " ")}`);
  parts.push(`  Body: ${bible?.camera_language?.body || "ARRI Alexa Mini"}`);
  parts.push(``);

  // Lighting
  parts.push(`LIGHTING:`);
  parts.push(`  Setup: ${lightingSetup.replace(/_/g, " ")}`);
  parts.push(`  Mood: ${lightingMood}`);
  parts.push(`  Color temp: ${bible?.lighting_bible?.color_temp_kelvin || 5600}K`);
  parts.push(``);

  // Character DNA (if avatar selected)
  if (bible?.avatar_dna) {
    parts.push(`CHARACTER:`);
    parts.push(`  Face: ${bible.avatar_dna.face}`);
    parts.push(`  Skin: ${bible.avatar_dna.skin}`);
    parts.push(`  Eyes: ${bible.avatar_dna.eyes}`);
    parts.push(`  Hair: ${bible.avatar_dna.hair}`);
    parts.push(`  Wardrobe: ${bible.avatar_dna.wardrobe}`);
    parts.push(``);
  }

  // Product DNA
  if (scene.product_visibility !== "none" && productDNA) {
    parts.push(`PRODUCT (${scene.product_visibility.toUpperCase()}):`);
    parts.push(`  ${productDNA.visual_description}`);
    parts.push(`  Action: ${scene.product_action}`);
    parts.push(``);
  }

  // Realism requirements
  if (bible?.realism_rules) {
    parts.push(`REALISM REQUIREMENTS:`);
    parts.push(`- ${bible.realism_rules.skin_texture}`);
    parts.push(`- ${bible.realism_rules.face_structure}`);
    parts.push(`- ${bible.realism_rules.hands}`);
    parts.push(`- ${bible.realism_rules.environment}`);
    parts.push(``);

    // Prohibitions
    parts.push(`PROHIBITED:`);
    parts.push(`- ${bible.realism_rules.skin_prohibited}`);
    parts.push(`- ${bible.realism_rules.hands_prohibited}`);
    parts.push(`- ${bible.realism_rules.text_overlay}`);
  }

  return parts.join("\n");
}
