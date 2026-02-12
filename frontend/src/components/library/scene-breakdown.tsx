"use client";

import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Image as ImageIcon, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Scene {
  scene_number: number;
  scene_type?: string;
  dialogue?: string;
  description?: string;
  visual_description?: string;
  character_action?: string;
  camera_notes?: string;
  duration_seconds?: number;
  word_count?: number;
}

interface StoryboardScene {
  scene_number: string;
  image_url: string;
  prompt?: string;
}

interface SceneBreakdownProps {
  script?: {
    title?: string;
    scenes?: Scene[];
    total_duration?: number;
    style_notes?: string;
  };
  storyboard?: StoryboardScene[];
  audioClips?: { scene_number: number; url: string }[];
}

// Helper function to compute hierarchical scene numbers based on scene_type grouping
function computeHierarchicalSceneNumbers(scenes: Scene[]) {
  const grouped: { mainScene: number; subScene: number; scene: Scene }[] = [];
  let currentMainScene = 1;
  let currentSubScene = 1;
  let lastSceneType: string | undefined = undefined;

  scenes.forEach((scene) => {
    // If scene type changes, increment main scene and reset sub scene
    if (scene.scene_type && scene.scene_type !== lastSceneType) {
      if (lastSceneType !== undefined) {
        currentMainScene++;
      }
      currentSubScene = 1;
      lastSceneType = scene.scene_type;
    }

    grouped.push({
      mainScene: currentMainScene,
      subScene: currentSubScene,
      scene,
    });

    currentSubScene++;
  });

  return grouped;
}

export function SceneBreakdown({ script, storyboard, audioClips }: SceneBreakdownProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set(["1.1"])); // First scene expanded by default

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  const toggleScene = (sceneId: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  };

  if (!script?.scenes || script.scenes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">No script data available</p>
      </div>
    );
  }

  // Compute hierarchical scene numbers
  const hierarchicalScenes = computeHierarchicalSceneNumbers(script.scenes);

  return (
    <div className="space-y-4">
      {/* Script Header */}
      {script.title && (
        <div>
          <h3 className="text-lg font-semibold">{script.title}</h3>
          {script.style_notes && (
            <p className="text-sm text-muted-foreground">{script.style_notes}</p>
          )}
          {script.total_duration && (
            <Badge variant="secondary" className="mt-2">
              {script.total_duration}s duration
            </Badge>
          )}
        </div>
      )}

      {/* Scene Cards */}
      <div className="space-y-3">
        {hierarchicalScenes.map(({ mainScene, subScene, scene }, index) => {
          const sceneId = `${mainScene}.${subScene}`;
          const sceneNum = scene.scene_number;
          const isExpanded = expandedScenes.has(sceneId);
          const storyboardImage = storyboard?.find(
            (s) => parseInt(s.scene_number) === sceneNum
          );
          const audio = audioClips?.find((a) => a.scene_number === sceneNum);

          // Check if this is the first sub-scene of a new main scene (for separator)
          const isNewMainScene = index > 0 && hierarchicalScenes[index - 1].mainScene !== mainScene;

          // Build the full prompt for copying
          const fullPrompt = [
            `Scene ${sceneId}${scene.scene_type ? ` - ${scene.scene_type.toUpperCase()}` : ""}`,
            "",
            scene.dialogue ? `Dialogue: "${scene.dialogue}"` : "",
            scene.description ? `Description: ${scene.description}` : "",
            scene.visual_description ? `Visual: ${scene.visual_description}` : "",
            scene.character_action ? `Action: ${scene.character_action}` : "",
            scene.camera_notes ? `Camera: ${scene.camera_notes}` : "",
            scene.duration_seconds ? `Duration: ${scene.duration_seconds}s` : "",
          ]
            .filter(Boolean)
            .join("\n");

          return (
            <div key={sceneId}>
              {/* Main Scene Separator */}
              {isNewMainScene && (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {scene.scene_type ? scene.scene_type.replace(/_/g, " ") : `Scene ${mainScene}`}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}

              <Card className="overflow-hidden">
              <Collapsible
                open={isExpanded}
                onOpenChange={() => toggleScene(sceneId)}
              >
                <CardHeader className="cursor-pointer p-4 hover:bg-muted/50">
                  <CollapsibleTrigger className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">
                        Scene {sceneId}
                      </CardTitle>
                      {scene.scene_type && (
                        <Badge variant="outline" className="text-xs">
                          {scene.scene_type}
                        </Badge>
                      )}
                      {scene.duration_seconds && (
                        <span className="text-xs text-muted-foreground">
                          {scene.duration_seconds}s
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                </CardHeader>

                <CollapsibleContent>
                  <CardContent className="space-y-4 p-4 pt-0">
                    {/* Dialogue */}
                    {scene.dialogue && (
                      <div>
                        <h4 className="mb-1 text-xs font-medium text-muted-foreground">
                          Dialogue
                        </h4>
                        <p className="text-sm italic">"{scene.dialogue}"</p>
                        {scene.word_count && (
                          <span className="text-xs text-muted-foreground">
                            {scene.word_count} words
                          </span>
                        )}
                      </div>
                    )}

                    {/* Description */}
                    {scene.description && (
                      <div>
                        <h4 className="mb-1 text-xs font-medium text-muted-foreground">
                          Description
                        </h4>
                        <p className="text-sm">{scene.description}</p>
                      </div>
                    )}

                    {/* Visual Description */}
                    {scene.visual_description && (
                      <div>
                        <h4 className="mb-1 text-xs font-medium text-muted-foreground">
                          Visual Direction
                        </h4>
                        <p className="text-sm">{scene.visual_description}</p>
                      </div>
                    )}

                    {/* Character Action */}
                    {scene.character_action && (
                      <div>
                        <h4 className="mb-1 text-xs font-medium text-muted-foreground">
                          Character Action
                        </h4>
                        <p className="text-sm">{scene.character_action}</p>
                      </div>
                    )}

                    {/* Camera Notes */}
                    {scene.camera_notes && (
                      <div>
                        <h4 className="mb-1 text-xs font-medium text-muted-foreground">
                          Camera Setup
                        </h4>
                        <p className="text-sm font-mono text-xs">
                          {scene.camera_notes}
                        </p>
                      </div>
                    )}

                    {/* Storyboard Image */}
                    {storyboardImage?.image_url && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <ImageIcon className="size-3" />
                          Storyboard
                        </h4>
                        <img
                          src={storyboardImage.image_url}
                          alt={`Scene ${sceneId} storyboard`}
                          className="rounded-lg border"
                        />
                      </div>
                    )}

                    {/* Audio */}
                    {audio?.url && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <Volume2 className="size-3" />
                          Audio
                        </h4>
                        <audio src={audio.url} controls className="w-full" />
                      </div>
                    )}

                    {/* Copy Button */}
                    <div className="flex justify-end pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(fullPrompt, `scene-${sceneId}`)}
                      >
                        {copiedId === `scene-${sceneId}` ? (
                          <>
                            <Check className="mr-2 size-3" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 size-3" />
                            Copy Scene
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
            </div>
          );
        })}
      </div>

      {/* Copy All Button */}
      <div className="flex justify-end pt-2">
        <Button
          variant="default"
          onClick={() => {
            const allScenes = hierarchicalScenes
              .map(({ mainScene, subScene, scene }) => {
                const sceneId = `${mainScene}.${subScene}`;
                const fullPrompt = [
                  `Scene ${sceneId}${scene.scene_type ? ` - ${scene.scene_type.toUpperCase()}` : ""}`,
                  "",
                  scene.dialogue ? `Dialogue: "${scene.dialogue}"` : "",
                  scene.description ? `Description: ${scene.description}` : "",
                  scene.visual_description ? `Visual: ${scene.visual_description}` : "",
                  scene.character_action ? `Action: ${scene.character_action}` : "",
                  scene.camera_notes ? `Camera: ${scene.camera_notes}` : "",
                  scene.duration_seconds ? `Duration: ${scene.duration_seconds}s` : "",
                ]
                  .filter(Boolean)
                  .join("\n");
                return fullPrompt;
              })
              .join("\n\n---\n\n");

            handleCopy(
              `${script.title || "Video Script"}\n\n${allScenes}`,
              "all-scenes"
            );
          }}
        >
          {copiedId === "all-scenes" ? (
            <>
              <Check className="mr-2 size-4" />
              Copied All!
            </>
          ) : (
            <>
              <Copy className="mr-2 size-4" />
              Copy All Scenes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
