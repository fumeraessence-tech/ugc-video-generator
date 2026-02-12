"use client";

import { useState } from "react";
import { Check, X, RotateCcw, ZoomIn, Pencil, Eye, ImagePlus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface StoryboardFrame {
  id: string;
  url: string;
  sceneNumber: number;
  status?: "approved" | "rejected" | "pending";
  consistencyScore?: number;
  prompt?: string;
}

interface SceneScript {
  number: number;
  description: string;
  dialogue?: string;
  direction?: string;
}

interface StoryboardGalleryProps {
  frames: StoryboardFrame[];
  script?: SceneScript[];
  consistencyScores?: Array<{ scene: string | number; score: number }>;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onEditScene?: (sceneNumber: number, updates: Partial<SceneScript>) => void;
  onRegenerateFromEdit?: (sceneNumber: number) => void;
  onAddReferenceImages?: () => void;
}

export function StoryboardGallery({
  frames,
  script,
  consistencyScores,
  onApprove,
  onReject,
  onRegenerate,
  onEditScene,
  onRegenerateFromEdit,
  onAddReferenceImages,
}: StoryboardGalleryProps) {
  const [selectedFrame, setSelectedFrame] = useState<StoryboardFrame | null>(null);
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [editedScripts, setEditedScripts] = useState<Record<number, Partial<SceneScript>>>({});

  const getSceneScore = (sceneNumber: number): number | null => {
    if (!consistencyScores) return null;
    const entry = consistencyScores.find(
      (s) => String(s.scene) === String(sceneNumber)
    );
    return entry ? entry.score : null;
  };

  const getScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" => {
    if (score >= 0.85) return "default";
    if (score >= 0.75) return "secondary";
    return "destructive";
  };

  const handleScriptEdit = (sceneNumber: number, field: string, value: string) => {
    setEditedScripts((prev) => ({
      ...prev,
      [sceneNumber]: { ...prev[sceneNumber], [field]: value },
    }));
    onEditScene?.(sceneNumber, { [field]: value });
  };

  const getSceneScript = (sceneNumber: number): SceneScript | undefined => {
    const base = script?.find((s) => s.number === sceneNumber);
    const edits = editedScripts[sceneNumber];
    return base ? { ...base, ...edits } : undefined;
  };

  const hasLowScores = consistencyScores?.some((s) => s.score < 0.75) ?? false;

  return (
    <>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">
            Storyboard Preview
          </p>
          {hasLowScores && onAddReferenceImages && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={onAddReferenceImages}
            >
              <ImagePlus className="size-3 mr-1" />
              Add References
            </Button>
          )}
        </div>

        {/* Low consistency warning */}
        {hasLowScores && (
          <div className="flex items-start gap-2 p-2 mb-3 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-400">
              <p className="font-medium">Low character consistency detected</p>
              <p className="mt-0.5">Some scenes scored below 75%. Add more reference images or regenerate individual scenes.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {frames.map((frame) => {
            const score = getSceneScore(frame.sceneNumber);
            const sceneData = getSceneScript(frame.sceneNumber);
            const isEditingThis = editingScene === frame.sceneNumber;
            const isModified = !!editedScripts[frame.sceneNumber];

            return (
              <div
                key={frame.id}
                className={cn(
                  "relative rounded-lg border overflow-hidden group",
                  frame.status === "approved" && "border-foreground",
                  frame.status === "rejected" && "border-destructive opacity-50"
                )}
              >
                {/* Image */}
                <div
                  className="cursor-pointer"
                  onClick={() => setSelectedFrame(frame)}
                >
                  <img
                    src={frame.url}
                    alt={`Scene ${frame.sceneNumber}`}
                    className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                    <ZoomIn className="size-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>

                {/* Bottom bar */}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 z-10">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-white">
                      Scene {frame.sceneNumber}
                    </span>
                    {score !== null && (
                      <Badge
                        variant={getScoreBadgeVariant(score)}
                        className="text-[10px] h-4 px-1"
                      >
                        {Math.round(score * 100)}%
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-0.5">
                    {script && onEditScene && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-white hover:text-amber-400 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingScene(isEditingThis ? null : frame.sceneNumber);
                        }}
                      >
                        {isEditingThis ? <Eye className="size-3" /> : <Pencil className="size-3" />}
                      </Button>
                    )}
                    {onApprove && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-white hover:text-green-400 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          onApprove(frame.id);
                        }}
                      >
                        <Check className="size-3" />
                      </Button>
                    )}
                    {onReject && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-white hover:text-red-400 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReject(frame.id);
                        }}
                      >
                        <X className="size-3" />
                      </Button>
                    )}
                    {onRegenerate && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-white hover:text-blue-400 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRegenerate(frame.id);
                        }}
                      >
                        <RotateCcw className="size-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Inline script editor */}
                {isEditingThis && sceneData && (
                  <div className="p-2 bg-secondary/50 space-y-1.5 border-t">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Description</label>
                      <Textarea
                        className="text-xs min-h-[40px] resize-none mt-0.5"
                        value={sceneData.description}
                        onChange={(e) =>
                          handleScriptEdit(frame.sceneNumber, "description", e.target.value)
                        }
                      />
                    </div>
                    {sceneData.dialogue !== undefined && (
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase">Dialogue</label>
                        <Textarea
                          className="text-xs min-h-[30px] resize-none mt-0.5"
                          value={sceneData.dialogue || ""}
                          onChange={(e) =>
                            handleScriptEdit(frame.sceneNumber, "dialogue", e.target.value)
                          }
                        />
                      </div>
                    )}
                    {onRegenerateFromEdit && isModified && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-6 text-xs mt-1"
                        onClick={() => onRegenerateFromEdit(frame.sceneNumber)}
                      >
                        <RotateCcw className="size-3 mr-1" />
                        Regenerate from Edit
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Full-size image modal */}
      <Dialog open={!!selectedFrame} onOpenChange={() => setSelectedFrame(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Scene {selectedFrame?.sceneNumber}
              {selectedFrame && getSceneScore(selectedFrame.sceneNumber) !== null && (
                <Badge
                  variant={getScoreBadgeVariant(getSceneScore(selectedFrame.sceneNumber)!)}
                >
                  Consistency: {Math.round(getSceneScore(selectedFrame.sceneNumber)! * 100)}%
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedFrame && (
            <div className="relative w-full">
              <img
                src={selectedFrame.url}
                alt={`Scene ${selectedFrame.sceneNumber} - Full size`}
                className="w-full h-auto rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
