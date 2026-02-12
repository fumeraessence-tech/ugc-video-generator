"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Video,
  Camera,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  GripVertical,
  Trash2,
  Plus,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMassGeneratorStore } from "@/stores/mass-generator-store";
import { SCENE_TYPE_LABELS, type Scene, type Script } from "@/types/mass-generator";
import { backendFetch } from "@/lib/backend-fetch";
import { cn } from "@/lib/utils";

export function ScriptStep() {
  const {
    productDNA,
    avatarDNA,
    creativeBrief,
    platform,
    style,
    tone,
    duration,
    script,
    setScript,
    setProductionBible,
    isLoading,
    setLoading,
    error,
    setError,
    prevStep,
    nextStep,
  } = useMassGeneratorStore();

  const [selectedScene, setSelectedScene] = useState<string | null>(null);

  const generateScript = async () => {
    if (!productDNA || !creativeBrief) {
      setError("Missing product DNA or creative brief.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First, assemble the Production Bible
      const bibleResponse = await backendFetch(
        "/api/v1/mass-generator/assemble-bible",
        {
          method: "POST",
          body: JSON.stringify({
            product_dna: productDNA,
            avatar_dna: avatarDNA,
            user_prompt: creativeBrief.user_input,
            platform,
            style,
            tone,
            duration,
          }),
        }
      );

      const bibleData = await bibleResponse.json();

      if (!bibleData.success || !bibleData.bible) {
        throw new Error(bibleData.error || "Failed to assemble production bible");
      }

      setProductionBible(bibleData.bible);

      // Then, generate the script
      const scriptResponse = await backendFetch(
        "/api/v1/mass-generator/generate-script",
        {
          method: "POST",
          body: JSON.stringify({
            bible: bibleData.bible,
          }),
        }
      );

      const scriptData = await scriptResponse.json();

      if (!scriptData.success || !scriptData.script) {
        throw new Error(scriptData.error || "Failed to generate script");
      }

      // Normalize the script data to match frontend types
      // Backend Gemini output uses character_action/character_expression
      // Frontend Scene type expects action/expression
      const normalizedScript = normalizeScriptFromBackend(scriptData.script);
      setScript(normalizedScript);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const regenerateScene = async (sceneNumber: string) => {
    // For now, just regenerate the whole script
    // TODO: Implement single scene regeneration
    await generateScript();
  };

  const deleteScene = (sceneNumber: string) => {
    if (!script) return;
    const updatedScenes = script.scenes.filter(
      (s) => s.scene_number !== sceneNumber
    );
    setScript({ ...script, scenes: updatedScenes });
  };

  const updateScene = (updatedScene: Scene) => {
    if (!script) return;
    const updatedScenes = script.scenes.map((s) =>
      s.scene_number === updatedScene.scene_number ? updatedScene : s
    );
    setScript({ ...script, scenes: updatedScenes });
  };

  const canProceed = script !== null && script.scenes.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Script Generation</h2>
        <p className="text-muted-foreground">
          Generate a complete script with all scenes, dialogue, and technical
          directions.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Generate Button */}
      {!script && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <div className="size-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Video className="size-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Ready to Generate Script</h3>
                <p className="text-sm text-muted-foreground">
                  Based on your product DNA and creative brief, we'll generate a
                  complete {duration}-second {style.replace("_", " ")} script.
                </p>
              </div>
              <Button
                onClick={generateScript}
                disabled={isLoading}
                size="lg"
                className="mt-4"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Generating Script...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 mr-2" />
                    Generate Script
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Script Display */}
      {script && (
        <div className="space-y-4">
          {/* Script Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{script.title}</h3>
              <p className="text-sm text-muted-foreground">
                {script.scenes.length} scenes · {script.total_duration}s total
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={generateScript}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn("size-4 mr-2", isLoading && "animate-spin")}
              />
              Regenerate All
            </Button>
          </div>

          {/* Scenes */}
          <div className="space-y-3">
            {script.scenes.map((scene) => (
              <SceneCard
                key={scene.scene_number}
                scene={scene}
                isSelected={selectedScene === scene.scene_number}
                onSelect={() =>
                  setSelectedScene(
                    selectedScene === scene.scene_number
                      ? null
                      : scene.scene_number
                  )
                }
                onRegenerate={() => regenerateScene(scene.scene_number)}
                onDelete={() => deleteScene(scene.scene_number)}
                onUpdate={updateScene}
                isLoading={isLoading}
              />
            ))}
          </div>

          {/* Add Scene Button */}
          <Button variant="outline" className="w-full" disabled>
            <Plus className="size-4 mr-2" />
            Add Scene (Coming Soon)
          </Button>

          {/* Audio Direction */}
          {script.audio_direction && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="size-4" />
                  Audio Direction
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>
                  <span className="text-muted-foreground">Tone:</span>{" "}
                  {script.audio_direction.overall_tone}
                </p>
                <p>
                  <span className="text-muted-foreground">Pacing:</span>{" "}
                  {script.audio_direction.pacing_notes}
                </p>
                {script.audio_direction.emphasis_words.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">Emphasize:</span>{" "}
                    {script.audio_direction.emphasis_words.join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>
          Back
        </Button>
        <Button onClick={nextStep} disabled={!canProceed} size="lg">
          Next: Generate Storyboard
        </Button>
      </div>
    </div>
  );
}

// Helper function to normalize script data from backend
// Backend Gemini uses character_action/character_expression, frontend uses action/expression
function normalizeScriptFromBackend(rawScript: Record<string, unknown>): Script {
  const scenes = (rawScript.scenes as Array<Record<string, unknown>>) || [];

  const normalizedScenes: Scene[] = scenes.map((scene, idx) => {
    // Handle field name differences
    const dialogue = (scene.dialogue as string) || "";
    const action = (scene.action as string) || (scene.character_action as string) || "Scene action";
    const expression = (scene.expression as string) || (scene.character_expression as string) || "neutral";

    // Parse scene_number - could be string like "1.1" or number
    const sceneNum = scene.scene_number;
    const sceneNumberStr = typeof sceneNum === 'number' ? String(sceneNum) : (sceneNum as string) || `${idx + 1}`;

    // Parse duration
    const duration = typeof scene.duration_seconds === 'number'
      ? scene.duration_seconds
      : parseFloat(String(scene.duration_seconds)) || 5;

    // Parse times
    const startTime = typeof scene.start_time === 'number'
      ? scene.start_time
      : parseFloat(String(scene.start_time)) || 0;
    const endTime = typeof scene.end_time === 'number'
      ? scene.end_time
      : parseFloat(String(scene.end_time)) || (startTime + duration);

    // Parse camera - handle nested object or defaults
    const cameraRaw = (scene.camera as Record<string, string>) || {};
    const camera: Scene["camera"] = {
      shot_type: cameraRaw.shot_type || "medium_close_up",
      angle: cameraRaw.angle || "eye_level",
      movement: cameraRaw.movement || "static",
      focus: cameraRaw.focus || "subject",
    };

    // Parse lighting
    const lightingRaw = (scene.lighting as Record<string, string>) || {};
    const lighting: Scene["lighting"] = {
      setup: lightingRaw.setup || "natural_window",
      mood: lightingRaw.mood || "warm",
    };

    // Map scene type
    const sceneTypeRaw = (scene.scene_type as string) || "demo";
    const validSceneTypes: Scene["scene_type"][] = ["hook", "problem", "solution", "demo", "social_proof", "cta"];
    const sceneType: Scene["scene_type"] = validSceneTypes.includes(sceneTypeRaw as Scene["scene_type"])
      ? (sceneTypeRaw as Scene["scene_type"])
      : "demo";

    return {
      scene_number: sceneNumberStr,
      scene_type: sceneType,
      duration_seconds: duration,
      start_time: startTime,
      end_time: endTime,
      dialogue,
      action,
      expression,
      product_visibility: (scene.product_visibility as Scene["product_visibility"]) || "none",
      product_action: (scene.product_action as string) || "",
      camera,
      lighting,
      audio_notes: (scene.audio_notes as string) || "",
    };
  });

  // Parse audio direction
  const audioDirectionRaw = (rawScript.audio_direction as Record<string, unknown>) || {};
  const audioDirection: Script["audio_direction"] = {
    overall_tone: (audioDirectionRaw.overall_tone as string) || "conversational",
    pacing_notes: (audioDirectionRaw.pacing_notes as string) || "natural pace",
    emphasis_words: (audioDirectionRaw.emphasis_words as string[]) || [],
  };

  return {
    title: (rawScript.title as string) || "Untitled Script",
    total_duration: typeof rawScript.total_duration === 'number'
      ? rawScript.total_duration
      : parseFloat(String(rawScript.total_duration)) || 30,
    scenes: normalizedScenes,
    audio_direction: audioDirection,
  };
}

// Scene Card Component
interface SceneCardProps {
  scene: Scene;
  isSelected: boolean;
  onSelect: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  onUpdate: (updatedScene: Scene) => void;
  isLoading: boolean;
}

function SceneCard({
  scene,
  isSelected,
  onSelect,
  onRegenerate,
  onDelete,
  onUpdate,
  isLoading,
}: SceneCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDialogue, setEditDialogue] = useState(scene.dialogue);
  const [editAction, setEditAction] = useState(scene.action);
  const [editExpression, setEditExpression] = useState(scene.expression);

  const typeColors: Record<Scene["scene_type"], string> = {
    hook: "bg-red-500/10 text-red-600",
    problem: "bg-orange-500/10 text-orange-600",
    solution: "bg-green-500/10 text-green-600",
    demo: "bg-blue-500/10 text-blue-600",
    social_proof: "bg-purple-500/10 text-purple-600",
    cta: "bg-pink-500/10 text-pink-600",
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditDialogue(scene.dialogue);
    setEditAction(scene.action);
    setEditExpression(scene.expression);
    setIsEditing(true);
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate({
      ...scene,
      dialogue: editDialogue,
      action: editAction,
      expression: editExpression,
    });
    setIsEditing(false);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setEditDialogue(scene.dialogue);
    setEditAction(scene.action);
    setEditExpression(scene.expression);
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all",
        isSelected && "ring-2 ring-primary"
      )}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Drag Handle */}
          <div className="pt-1 text-muted-foreground cursor-grab">
            <GripVertical className="size-4" />
          </div>

          {/* Scene Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant="secondary"
                className={cn("text-xs", typeColors[scene.scene_type])}
              >
                {SCENE_TYPE_LABELS[scene.scene_type]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {scene.start_time}s - {scene.end_time}s ({scene.duration_seconds}s)
              </span>
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 ml-auto"
                  onClick={handleStartEdit}
                >
                  <Pencil className="size-3" />
                </Button>
              )}
            </div>

            {/* Dialogue - Editable */}
            {isEditing ? (
              <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Dialogue</label>
                  <Textarea
                    value={editDialogue}
                    onChange={(e) => setEditDialogue(e.target.value)}
                    className="text-sm resize-none"
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Action</label>
                  <Input
                    value={editAction}
                    onChange={(e) => setEditAction(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Expression</label>
                  <Input
                    value={editExpression}
                    onChange={(e) => setEditExpression(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit}>
                    <Check className="size-3 mr-1" />
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                    <X className="size-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="font-medium mb-2">"{scene.dialogue}"</p>

                {/* Expanded Details */}
                {isSelected && (
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-20">Action:</span>
                      <span>{scene.action}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-20">Expression:</span>
                      <span>{scene.expression}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Camera className="size-4 text-muted-foreground mt-0.5" />
                      <span>
                        {scene.camera.shot_type.replace("_", " ")} ·{" "}
                        {scene.camera.angle.replace("_", " ")} ·{" "}
                        {scene.camera.movement.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Lightbulb className="size-4 text-muted-foreground mt-0.5" />
                      <span>
                        {scene.lighting.setup.replace("_", " ")} · {scene.lighting.mood}
                      </span>
                    </div>
                    {scene.product_visibility !== "none" && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-20">Product:</span>
                        <span>
                          {scene.product_visibility} - {scene.product_action}
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <MessageSquare className="size-4 text-muted-foreground mt-0.5" />
                      <span className="italic">{scene.audio_notes}</span>
                    </div>

                    {/* Scene Actions */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleStartEdit}
                      >
                        <Pencil className="size-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRegenerate();
                        }}
                        disabled={isLoading}
                      >
                        <RefreshCw className="size-3 mr-1" />
                        Regenerate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete();
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Thumbnail Placeholder */}
          <div className="size-16 rounded bg-muted flex items-center justify-center shrink-0">
            <Video className="size-6 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
