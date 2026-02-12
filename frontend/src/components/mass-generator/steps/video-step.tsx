"use client";

import { useState } from "react";
import {
  Video,
  Loader2,
  AlertCircle,
  Check,
  Copy,
  Download,
  Play,
  Pause,
  Settings,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useMassGeneratorStore } from "@/stores/mass-generator-store";
import { backendFetch } from "@/lib/backend-fetch";
import { useEditorStore } from "@/stores/editor-store";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { TimelineClip, ScriptSceneData } from "@/types/editor";
import { Film } from "lucide-react";

interface VideoClip {
  clip_number: number;
  video_url: string;
  status: "pending" | "generating" | "completed" | "failed";
  error?: string;
}

interface SceneVideo {
  scene_number: string;
  storyboard_url: string;
  prompt: string;
  num_clips: number;
  clips: VideoClip[];
}

type GenerationStatus = "idle" | "generating" | "complete" | "error";

interface VideoSettings {
  duration_seconds: number;
  model: string;
  generate_audio: boolean;
  aspect_ratio: string;
}

export function VideoStep() {
  const {
    script,
    productImages,
    productDNA,
    productName,
    avatarReferenceImages,
    avatarDNA,
    productionBible,
    platform,
    style,
    error,
    setError,
    prevStep,
    reset,
  } = useMassGeneratorStore();

  const { toast } = useToast();
  const router = useRouter();
  const { initializeFromWizard } = useEditorStore();

  // Build comprehensive video prompt for a scene
  const buildVideoPrompt = (scene: NonNullable<typeof script>["scenes"][0]) => {
    const parts: string[] = [];

    // Header
    parts.push("Generate a professional UGC video clip for social media advertisement.");
    parts.push("");

    // Scene context
    parts.push("########################################");
    parts.push("# SCENE CONTEXT");
    parts.push("########################################");
    parts.push(`Scene Type: ${scene.scene_type}`);
    parts.push(`Scene Number: ${scene.scene_number}`);
    parts.push(`Duration: ${scene.duration_seconds} seconds`);
    parts.push("");
    parts.push("DIALOGUE (spoken, NOT displayed as text):");
    parts.push(`"${scene.dialogue}"`);
    parts.push("");
    parts.push("ACTION:");
    parts.push(`${scene.action}`);
    parts.push("");
    parts.push("EXPRESSION/EMOTION:");
    parts.push(`${scene.expression}`);
    parts.push("");

    // Camera specifications
    parts.push("########################################");
    parts.push("# CAMERA SPECIFICATIONS");
    parts.push("########################################");
    parts.push(`Shot Type: ${scene.camera.shot_type.replace(/_/g, " ")}`);
    parts.push(`Camera Angle: ${scene.camera.angle.replace(/_/g, " ")}`);
    parts.push(`Camera Movement: ${scene.camera.movement.replace(/_/g, " ")}`);
    parts.push(`Focus: ${scene.camera.focus}`);
    if (productionBible?.camera_language) {
      parts.push(`Camera Body: ${productionBible.camera_language.body}`);
      parts.push(`Lens: ${productionBible.camera_language.lens_mm}mm`);
      parts.push(`Depth of Field: ${productionBible.camera_language.depth_of_field}`);
    }
    parts.push("");

    // Lighting specifications
    parts.push("########################################");
    parts.push("# LIGHTING SPECIFICATIONS");
    parts.push("########################################");
    parts.push(`Lighting Setup: ${scene.lighting.setup.replace(/_/g, " ")}`);
    parts.push(`Mood: ${scene.lighting.mood}`);
    if (productionBible?.lighting_bible) {
      parts.push(`Color Temperature: ${productionBible.lighting_bible.color_temp_kelvin}K`);
      parts.push(`Key Intensity: ${productionBible.lighting_bible.key_intensity}`);
      parts.push(`Fill Ratio: ${productionBible.lighting_bible.fill_ratio}`);
      if (productionBible.lighting_bible.rim_light) {
        parts.push("Rim Light: Yes - for depth separation");
      }
    }
    parts.push("");

    // Character DNA
    if (avatarDNA) {
      parts.push("########################################");
      parts.push("# CHARACTER DNA (MUST MATCH REFERENCE)");
      parts.push("########################################");
      if (avatarDNA.gender) parts.push(`Gender: ${avatarDNA.gender}`);
      if (avatarDNA.ethnicity) parts.push(`Ethnicity: ${avatarDNA.ethnicity}`);
      if (avatarDNA.age_range) parts.push(`Age Range: ${avatarDNA.age_range}`);
      parts.push("");
      parts.push("FACIAL FEATURES:");
      parts.push(`- Face: ${avatarDNA.face}`);
      parts.push(`- Eyes: ${avatarDNA.eyes}`);
      parts.push(`- Skin: ${avatarDNA.skin}`);
      parts.push(`- Hair: ${avatarDNA.hair}`);
      parts.push("");
      parts.push("BODY & WARDROBE:");
      parts.push(`- Body: ${avatarDNA.body}`);
      parts.push(`- Outfit: ${avatarDNA.wardrobe}`);
      parts.push("");
      parts.push("SKIN RENDERING (CRITICAL):");
      parts.push("- Natural skin texture with visible pores");
      parts.push("- Subtle subsurface scattering (skin translucency)");
      parts.push("- Natural color variation");
      parts.push("- NEVER plastic, waxy, or artificially smooth");
      parts.push("");
    }

    // Product details
    if (productDNA && scene.product_visibility !== "none") {
      parts.push("########################################");
      parts.push("# PRODUCT SPECIFICATIONS");
      parts.push("########################################");
      parts.push(`Product: ${productName || productDNA.product_name || "Product"}`);
      parts.push(`Product Type: ${productDNA.product_type}`);
      parts.push(`Visibility: ${scene.product_visibility}`);
      parts.push(`Product Action: ${scene.product_action}`);
      parts.push("");
      parts.push("VISUAL DETAILS:");
      parts.push(`- Primary Color: ${productDNA.colors.primary}`);
      if (productDNA.colors.secondary) parts.push(`- Secondary Color: ${productDNA.colors.secondary}`);
      parts.push(`- Shape: ${productDNA.shape}`);
      parts.push(`- Materials: ${productDNA.materials.join(", ")}`);
      parts.push(`- Size: ${productDNA.size_category}`);
      parts.push("");
      parts.push("PRODUCT HANDLING (CRITICAL):");
      parts.push("- Product must be held naturally with proper grip");
      parts.push("- Fingers wrap around naturally - no floating");
      parts.push("- Correct scale relative to hands");
      parts.push("- Weight should be visually apparent");
      parts.push("- NO flying, floating, or magically suspended objects");
      parts.push("");
    }

    // Video-specific motion requirements
    parts.push("########################################");
    parts.push("# VIDEO MOTION REQUIREMENTS");
    parts.push("########################################");
    parts.push("- Smooth, natural human movements");
    parts.push("- Lip sync must match spoken dialogue timing");
    parts.push("- Authentic facial expressions and micro-expressions");
    parts.push("- Natural eye blinks and eye movement");
    parts.push("- Realistic hand gestures and body language");
    parts.push("- Consistent character appearance throughout clip");
    parts.push("- No morphing, glitching, or unnatural transitions");
    parts.push("");

    // Style
    parts.push("########################################");
    parts.push("# STYLE & QUALITY");
    parts.push("########################################");
    parts.push(`Platform: ${platform}`);
    parts.push(`Video Style: ${style}`);
    parts.push("- Professional UGC video aesthetic");
    parts.push("- Cinematic quality with natural lighting");
    parts.push("- Authentic, relatable feel");
    parts.push("- High resolution, sharp details");
    parts.push("");

    // Prohibitions
    parts.push("########################################");
    parts.push("# ABSOLUTE PROHIBITIONS");
    parts.push("########################################");
    parts.push("❌ NO text, captions, subtitles, or watermarks");
    parts.push("❌ NO floating or flying objects");
    parts.push("❌ NO plastic or waxy skin");
    parts.push("❌ NO incorrect finger count or hand deformities");
    parts.push("❌ NO character morphing or appearance changes");
    parts.push("❌ NO unnatural movements or poses");

    return parts.join("\n");
  };

  // Get storyboard data from script scenes
  const [sceneVideos, setSceneVideos] = useState<SceneVideo[]>(() => {
    if (!script?.scenes) return [];
    return script.scenes.map((scene) => ({
      scene_number: scene.scene_number,
      storyboard_url: (scene as unknown as { storyboard_url?: string }).storyboard_url || "",
      prompt: buildVideoPrompt(scene),
      num_clips: 1,
      clips: [],
    }));
  });

  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [currentScene, setCurrentScene] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  // Video settings
  const [settings, setSettings] = useState<VideoSettings>({
    duration_seconds: 8,
    model: "veo-3.1",
    generate_audio: false,
    aspect_ratio: getAspectRatioForPlatform(platform),
  });

  // Packaging images for unboxing scenarios (can be expanded with UI later)
  const [packagingImages] = useState<string[]>([]);

  const updateSceneClips = (sceneIndex: number, numClips: number) => {
    setSceneVideos((prev) =>
      prev.map((scene, i) =>
        i === sceneIndex
          ? { ...scene, num_clips: Math.max(1, Math.min(3, numClips)) }
          : scene
      )
    );
  };

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

  const generateAllVideos = async () => {
    setGenerationStatus("generating");
    setError(null);
    setCurrentScene(0);

    const totalScenes = sceneVideos.length;
    const updatedScenes = [...sceneVideos];

    for (let i = 0; i < totalScenes; i++) {
      setCurrentScene(i + 1);
      const scene = updatedScenes[i];

      try {
        // Mark scene as generating
        updatedScenes[i] = {
          ...scene,
          clips: Array.from({ length: scene.num_clips }, (_, j) => ({
            clip_number: j + 1,
            video_url: "",
            status: "generating" as const,
          })),
        };
        setSceneVideos([...updatedScenes]);

        // Call API for this scene
        const response = await backendFetch(
          "/api/v1/video/generate-scene",
          {
            method: "POST",
            body: JSON.stringify({
              scene_number: parseInt(scene.scene_number),
              prompt: scene.prompt,
              storyboard_image_url: scene.storyboard_url,
              product_images: productImages || [],
              packaging_images: packagingImages,
              avatar_images: avatarReferenceImages || [],
              num_clips: scene.num_clips,
              duration_seconds: settings.duration_seconds,
              aspect_ratio: settings.aspect_ratio,
              model: settings.model,
              generate_audio: settings.generate_audio,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Server error: ${response.status}`);
        }

        const data = await response.json();

        // Update clips with results
        updatedScenes[i] = {
          ...scene,
          clips: (data.clips || []).map((clip: { clip_number: number; video_url: string; status: string; error?: string }) => ({
            clip_number: clip.clip_number,
            video_url: clip.video_url,
            status: clip.status === "completed" ? "completed" : "failed",
            error: clip.error,
          })),
        };
        setSceneVideos([...updatedScenes]);

        toast({
          title: `Scene ${i + 1} Complete`,
          description: `Generated ${data.total_clips} video clip(s)`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Video generation failed";

        // Mark clips as failed
        updatedScenes[i] = {
          ...scene,
          clips: Array.from({ length: scene.num_clips }, (_, j) => ({
            clip_number: j + 1,
            video_url: "",
            status: "failed" as const,
            error: message,
          })),
        };
        setSceneVideos([...updatedScenes]);

        toast({
          title: `Scene ${i + 1} Failed`,
          description: message,
          variant: "destructive",
        });
      }
    }

    setGenerationStatus("complete");
    toast({
      title: "Video Generation Complete",
      description: `Processed ${totalScenes} scenes`,
    });
  };

  const generateSingleScene = async (sceneIndex: number) => {
    const scene = sceneVideos[sceneIndex];
    const updatedScenes = [...sceneVideos];

    // Mark scene as generating
    updatedScenes[sceneIndex] = {
      ...scene,
      clips: Array.from({ length: scene.num_clips }, (_, j) => ({
        clip_number: j + 1,
        video_url: "",
        status: "generating" as const,
      })),
    };
    setSceneVideos([...updatedScenes]);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/api/v1/video/generate-scene`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scene_number: parseInt(scene.scene_number),
            prompt: scene.prompt,
            storyboard_image_url: scene.storyboard_url,
            product_images: productImages || [],
            packaging_images: packagingImages,
            avatar_images: avatarReferenceImages || [],
            num_clips: scene.num_clips,
            duration_seconds: settings.duration_seconds,
            aspect_ratio: settings.aspect_ratio,
            model: settings.model,
            generate_audio: settings.generate_audio,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();

      // Update clips with results
      updatedScenes[sceneIndex] = {
        ...scene,
        clips: (data.clips || []).map((clip: { clip_number: number; video_url: string; status: string; error?: string }) => ({
          clip_number: clip.clip_number,
          video_url: clip.video_url,
          status: clip.status === "completed" ? "completed" : "failed",
          error: clip.error,
        })),
      };
      setSceneVideos([...updatedScenes]);

      toast({
        title: `Scene ${sceneIndex + 1} Complete`,
        description: `Generated ${data.total_clips} video clip(s)`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Video generation failed";

      updatedScenes[sceneIndex] = {
        ...scene,
        clips: Array.from({ length: scene.num_clips }, (_, j) => ({
          clip_number: j + 1,
          video_url: "",
          status: "failed" as const,
          error: message,
        })),
      };
      setSceneVideos([...updatedScenes]);

      toast({
        title: `Scene ${sceneIndex + 1} Failed`,
        description: message,
        variant: "destructive",
      });
    }
  };

  const totalClips = sceneVideos.reduce((sum, s) => sum + s.num_clips, 0);
  const completedClips = sceneVideos.reduce(
    (sum, s) => sum + s.clips.filter((c) => c.status === "completed").length,
    0
  );
  const progressPercent = totalClips > 0 ? Math.round((completedClips / totalClips) * 100) : 0;

  const hasAnyVideos = sceneVideos.some((s) => s.clips.some((c) => c.video_url));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Generate Videos</h2>
        <p className="text-muted-foreground">
          Generate video clips for each scene using Veo 3.1 with your storyboard and product images.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Video Settings */}
      <Collapsible open={showSettings} onOpenChange={setShowSettings}>
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="size-4" />
                  Video Settings
                </CardTitle>
                {showSettings ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Duration */}
              <div className="space-y-2">
                <Label>Duration (seconds)</Label>
                <Select
                  value={settings.duration_seconds.toString()}
                  onValueChange={(v) => setSettings((s) => ({ ...s, duration_seconds: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 seconds (min)</SelectItem>
                    <SelectItem value="6">6 seconds</SelectItem>
                    <SelectItem value="8">8 seconds (max)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Model */}
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={settings.model}
                  onValueChange={(v) => setSettings((s) => ({ ...s, model: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="veo-3.1">Veo 3.1 (Best Quality)</SelectItem>
                    <SelectItem value="veo-3.1-fast">Veo 3.1 Fast</SelectItem>
                    <SelectItem value="veo-3.0">Veo 3.0</SelectItem>
                    <SelectItem value="veo-3.0-fast">Veo 3.0 Fast</SelectItem>
                    <SelectItem value="veo-2.0">Veo 2.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Aspect Ratio */}
              <div className="space-y-2">
                <Label>Aspect Ratio</Label>
                <Select
                  value={settings.aspect_ratio}
                  onValueChange={(v) => setSettings((s) => ({ ...s, aspect_ratio: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 (Portrait/Reels)</SelectItem>
                    <SelectItem value="16:9">16:9 (Landscape/YouTube)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Audio Toggle */}
              <div className="space-y-2">
                <Label>Generate Audio</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch
                    checked={settings.generate_audio}
                    onCheckedChange={(v: boolean) => setSettings((s) => ({ ...s, generate_audio: v }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {settings.generate_audio ? "Audio enabled" : "No audio"}
                  </span>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Reference Images Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Reference Images (Max 4)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">
              Product: {productImages?.length || 0}
            </Badge>
            <Badge variant="outline">
              Avatar: {avatarReferenceImages?.length || 0}
            </Badge>
            <Badge variant="outline">
              Packaging: {packagingImages.length}
            </Badge>
            <Badge variant="secondary">
              Storyboard: 1 per scene (STYLE)
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Product + Avatar = ASSET reference for consistency. Storyboard = STYLE reference.
          </p>
        </CardContent>
      </Card>

      {/* Generation Progress */}
      {generationStatus === "generating" && (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span className="font-medium">
                  Generating Scene {currentScene} of {sceneVideos.length}...
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {completedClips} of {totalClips} clips
                </span>
                <span>{progressPercent}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scene Cards */}
      <div className="space-y-4">
        {sceneVideos.map((scene, i) => (
          <Card key={scene.scene_number} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Video className="size-4" />
                  Scene {scene.scene_number}
                  {scene.clips.some((c) => c.status === "completed") && (
                    <Check className="size-4 text-green-500" />
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Clip Count Selector */}
                  <div className="flex items-center gap-1 border rounded-md px-2 py-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => updateSceneClips(i, scene.num_clips - 1)}
                      disabled={scene.num_clips <= 1 || generationStatus === "generating"}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">
                      {scene.num_clips}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => updateSceneClips(i, scene.num_clips + 1)}
                      disabled={scene.num_clips >= 3 || generationStatus === "generating"}
                    >
                      <Plus className="size-3" />
                    </Button>
                    <span className="text-xs text-muted-foreground ml-1">clips</span>
                  </div>
                  {/* Generate Single Scene */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateSingleScene(i)}
                    disabled={generationStatus === "generating"}
                  >
                    <Sparkles className="size-3 mr-1" />
                    Generate
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-[200px_1fr] gap-4">
                {/* Storyboard Preview */}
                <div className="space-y-2">
                  <div className="aspect-[9/16] relative rounded overflow-hidden bg-muted">
                    {scene.storyboard_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={scene.storyboard_url}
                        alt={`Scene ${scene.scene_number} storyboard`}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        No storyboard
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Storyboard (STYLE reference)
                  </p>
                </div>

                {/* Prompt and Videos */}
                <div className="space-y-4">
                  {/* Prompt Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Scene Prompt</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6"
                        onClick={() => copyToClipboard(scene.prompt, "Prompt")}
                      >
                        <Copy className="size-3" />
                      </Button>
                    </div>
                    <pre className="text-xs bg-muted p-2 rounded max-h-24 overflow-y-auto whitespace-pre-wrap">
                      {scene.prompt}
                    </pre>
                  </div>

                  {/* Generated Clips */}
                  {scene.clips.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs">Generated Clips</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {scene.clips.map((clip) => (
                          <div
                            key={clip.clip_number}
                            className={cn(
                              "aspect-[9/16] relative rounded overflow-hidden bg-muted border",
                              clip.status === "completed" && "border-green-500",
                              clip.status === "failed" && "border-red-500",
                              clip.status === "generating" && "border-blue-500"
                            )}
                          >
                            {clip.status === "generating" && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="size-6 animate-spin text-blue-500" />
                              </div>
                            )}
                            {clip.status === "completed" && clip.video_url && (
                              <>
                                <video
                                  src={clip.video_url}
                                  className="absolute inset-0 w-full h-full object-cover"
                                  loop
                                  muted={playingVideo !== `${scene.scene_number}-${clip.clip_number}`}
                                  playsInline
                                  onPlay={() => setPlayingVideo(`${scene.scene_number}-${clip.clip_number}`)}
                                  onPause={() => setPlayingVideo(null)}
                                />
                                <div className="absolute bottom-0 left-0 right-0 p-1 bg-black/60 flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 text-white hover:text-white"
                                    onClick={(e) => {
                                      const video = e.currentTarget.parentElement?.previousElementSibling as HTMLVideoElement;
                                      if (video.paused) {
                                        video.play();
                                      } else {
                                        video.pause();
                                      }
                                    }}
                                  >
                                    {playingVideo === `${scene.scene_number}-${clip.clip_number}` ? (
                                      <Pause className="size-3" />
                                    ) : (
                                      <Play className="size-3" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 text-white hover:text-white"
                                    onClick={() => {
                                      const link = document.createElement("a");
                                      link.href = clip.video_url;
                                      link.download = `scene-${scene.scene_number}-clip-${clip.clip_number}.mp4`;
                                      document.body.appendChild(link);
                                      link.click();
                                      document.body.removeChild(link);
                                    }}
                                  >
                                    <Download className="size-3" />
                                  </Button>
                                </div>
                              </>
                            )}
                            {clip.status === "failed" && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
                                <AlertCircle className="size-4 text-red-500 mb-1" />
                                <span className="text-xs text-red-500">
                                  {clip.error?.slice(0, 50) || "Failed"}
                                </span>
                              </div>
                            )}
                            <span className="absolute top-1 left-1 text-xs text-white bg-black/60 px-1 rounded">
                              #{clip.clip_number}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Generate All Button */}
      {generationStatus !== "generating" && (
        <Button
          onClick={generateAllVideos}
          disabled={sceneVideos.length === 0}
          size="lg"
          className="w-full"
        >
          <Video className="size-4 mr-2" />
          Generate All Videos ({totalClips} clips)
        </Button>
      )}

      {/* Complete Actions */}
      {hasAnyVideos && generationStatus !== "generating" && (
        <div className="space-y-3">
          {/* Continue to Editor - primary CTA */}
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={() => {
              // Build scene clips map from generated videos
              const sceneClipsMap: Record<number, TimelineClip[]> = {};
              const scriptScenesList: ScriptSceneData[] = [];

              sceneVideos.forEach((scene, idx) => {
                const sceneNum = idx + 1;
                const completedClips = scene.clips.filter(
                  (c) => c.status === "completed" && c.video_url
                );

                scriptScenesList.push({
                  sceneNumber: sceneNum,
                  dialogue: script?.scenes[idx]?.dialogue || "",
                  action: script?.scenes[idx]?.action || "",
                  sceneType: script?.scenes[idx]?.scene_type || "hook",
                  duration: script?.scenes[idx]?.duration_seconds || settings.duration_seconds,
                });

                sceneClipsMap[sceneNum] = completedClips.length > 0
                  ? completedClips.map((clip, clipIdx) => ({
                      id: `clip-${sceneNum}-${clip.clip_number}`,
                      sceneNumber: sceneNum,
                      clipNumber: clip.clip_number,
                      videoUrl: clip.video_url,
                      duration: settings.duration_seconds,
                      trimStart: 0,
                      trimEnd: 0,
                      order: 0,
                    }))
                  : [{
                      id: `clip-${sceneNum}-1`,
                      sceneNumber: sceneNum,
                      clipNumber: 1,
                      videoUrl: "",
                      duration: script?.scenes[idx]?.duration_seconds || settings.duration_seconds,
                      trimStart: 0,
                      trimEnd: 0,
                      order: 0,
                    }];
              });

              const projectId = `project-${Date.now()}`;
              initializeFromWizard({
                projectId,
                sceneClips: sceneClipsMap,
                scriptScenes: scriptScenesList,
              });

              router.push("/editor");
            }}
          >
            <Film className="size-4" />
            Continue to Editor
          </Button>

          <div className="flex gap-4">
            <Button variant="outline" onClick={reset} className="flex-1">
              Start New Project
            </Button>
            <Button variant="outline" onClick={generateAllVideos} className="flex-1">
              <Sparkles className="size-4 mr-2" />
              Regenerate All
            </Button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep} disabled={generationStatus === "generating"}>
          Back
        </Button>
      </div>
    </div>
  );
}

function getAspectRatioForPlatform(platform: string): string {
  const mapping: Record<string, string> = {
    instagram_reels: "9:16",
    tiktok: "9:16",
    youtube_shorts: "9:16",
    youtube: "16:9",
    instagram_feed: "1:1",
    facebook: "1:1",
  };
  return mapping[platform] || "9:16";
}
