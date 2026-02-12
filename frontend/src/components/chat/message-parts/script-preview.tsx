"use client";

import * as React from "react";
import { ChevronDown, FileText, Pencil, Eye, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Scene {
  number: number;
  description: string;
  dialogue?: string;
  duration?: string;
  direction?: string;
  visual_description?: string;
  character_action?: string;
  camera_notes?: string;
}

interface ScriptPreviewProps {
  title?: string;
  scenes: Scene[];
  editable?: boolean;
  onSceneEdit?: (sceneNumber: number, updatedScene: Partial<Scene>) => void;
  onRegenerateScene?: (sceneNumber: number) => void;
  onRegenerateAll?: () => void;
  onSaveEdits?: (scenes: Scene[]) => void;
}

export function ScriptPreview({
  title,
  scenes,
  editable = false,
  onSceneEdit,
  onRegenerateScene,
  onRegenerateAll,
  onSaveEdits,
}: ScriptPreviewProps) {
  const [open, setOpen] = React.useState(false);
  const [editingScene, setEditingScene] = React.useState<number | null>(null);
  const [editedScenes, setEditedScenes] = React.useState<Record<number, Partial<Scene>>>({});

  const hasEdits = Object.keys(editedScenes).length > 0;

  const getSceneData = (scene: Scene): Scene => {
    const edits = editedScenes[scene.number];
    return edits ? { ...scene, ...edits } : scene;
  };

  const handleFieldEdit = (sceneNumber: number, field: keyof Scene, value: string) => {
    setEditedScenes((prev) => ({
      ...prev,
      [sceneNumber]: {
        ...prev[sceneNumber],
        [field]: value,
      },
    }));
    onSceneEdit?.(sceneNumber, { [field]: value });
  };

  const handleSaveAll = () => {
    const updatedScenes = scenes.map((scene) => getSceneData(scene));
    onSaveEdits?.(updatedScenes);
    setEditedScenes({});
    setEditingScene(null);
  };

  return (
    <div className="mt-3 rounded-lg border bg-secondary/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-3 text-left hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {title ?? "Generated Script"}
          </span>
          <span className="text-xs text-muted-foreground">
            {scenes.length} scenes
          </span>
          {hasEdits && (
            <span className="text-xs text-amber-600 font-medium">
              (edited)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {editable && open && onRegenerateAll && hasEdits && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onRegenerateAll();
              }}
            >
              <RotateCcw className="size-3 mr-1" />
              Regenerate All
            </Button>
          )}
          {editable && open && hasEdits && onSaveEdits && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                handleSaveAll();
              }}
            >
              <Save className="size-3 mr-1" />
              Save
            </Button>
          )}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>
      {open && (
        <div className="border-t p-3 space-y-3">
          {scenes.map((rawScene) => {
            const scene = getSceneData(rawScene);
            const isEditing = editingScene === scene.number;
            const isModified = !!editedScenes[scene.number];

            return (
              <div
                key={scene.number}
                className={cn(
                  "border-l-2 pl-3",
                  isModified
                    ? "border-amber-500"
                    : "border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Scene {scene.number}
                    </span>
                    {scene.duration && (
                      <span className="text-xs text-muted-foreground">
                        ({scene.duration})
                      </span>
                    )}
                    {isModified && (
                      <span className="text-[10px] text-amber-600 font-medium">
                        edited
                      </span>
                    )}
                  </div>
                  {editable && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() =>
                          setEditingScene(isEditing ? null : scene.number)
                        }
                      >
                        {isEditing ? (
                          <Eye className="size-3" />
                        ) : (
                          <Pencil className="size-3" />
                        )}
                      </Button>
                      {onRegenerateScene && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => onRegenerateScene(scene.number)}
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Description</label>
                      <Textarea
                        className="text-sm min-h-[60px] resize-none mt-0.5"
                        value={scene.description}
                        onChange={(e) =>
                          handleFieldEdit(scene.number, "description", e.target.value)
                        }
                      />
                    </div>
                    {(scene.dialogue !== undefined) && (
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase">Dialogue</label>
                        <Textarea
                          className="text-sm min-h-[40px] resize-none mt-0.5"
                          value={scene.dialogue || ""}
                          onChange={(e) =>
                            handleFieldEdit(scene.number, "dialogue", e.target.value)
                          }
                        />
                      </div>
                    )}
                    {(scene.direction !== undefined) && (
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase">Direction</label>
                        <Textarea
                          className="text-sm min-h-[40px] resize-none mt-0.5"
                          value={scene.direction || ""}
                          onChange={(e) =>
                            handleFieldEdit(scene.number, "direction", e.target.value)
                          }
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-sm">{scene.description}</p>
                    {scene.dialogue && (
                      <p className="text-sm text-muted-foreground mt-1 italic">
                        &ldquo;{scene.dialogue}&rdquo;
                      </p>
                    )}
                    {scene.direction && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {scene.direction}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
