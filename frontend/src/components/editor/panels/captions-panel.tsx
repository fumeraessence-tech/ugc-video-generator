"use client";

import { useState } from "react";
import { useEditorStore } from "@/stores/editor-store";
import {
  FONT_OPTIONS,
  type Caption,
  type CaptionPosition,
  type CaptionAlignment,
  type CaptionAnimation,
} from "@/types/editor";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUp,
  Minus as MinusIcon,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function CaptionsPanel() {
  const {
    captions,
    captionStyle,
    setCaptions,
    addCaption,
    updateCaption,
    removeCaption,
    setCaptionStyle,
    scriptScenes,
    timelineClips,
    selectedCaptionId,
    setSelectedCaption,
  } = useEditorStore();

  const [editingId, setEditingId] = useState<string | null>(null);

  // Auto-generate captions from script dialogue
  const autoGenerateCaptions = () => {
    const newCaptions: Caption[] = [];
    let currentTime = 0;

    timelineClips.forEach((clip) => {
      const scene = scriptScenes.find(
        (s) => s.sceneNumber === clip.sceneNumber
      );
      if (!scene?.dialogue) {
        currentTime += clip.duration - clip.trimStart - clip.trimEnd;
        return;
      }

      const effectiveDuration = clip.duration - clip.trimStart - clip.trimEnd;
      const words = scene.dialogue.split(/\s+/);
      const chunkSize = 6; // ~6 words per caption
      const chunks: string[] = [];

      for (let i = 0; i < words.length; i += chunkSize) {
        chunks.push(words.slice(i, i + chunkSize).join(" "));
      }

      const timePerChunk = effectiveDuration / chunks.length;

      chunks.forEach((text, idx) => {
        newCaptions.push({
          id: `cap-${clip.sceneNumber}-${idx}-${Date.now()}`,
          text,
          startTime: currentTime + idx * timePerChunk,
          endTime: currentTime + (idx + 1) * timePerChunk,
          sceneNumber: clip.sceneNumber,
        });
      });

      currentTime += effectiveDuration;
    });

    setCaptions(newCaptions);
  };

  const addManualCaption = () => {
    const lastCaption = captions[captions.length - 1];
    const startTime = lastCaption ? lastCaption.endTime : 0;

    addCaption({
      id: `cap-manual-${Date.now()}`,
      text: "New caption",
      startTime,
      endTime: startTime + 2,
      sceneNumber: 1,
    });
  };

  return (
    <div className="space-y-5">
      <h3 className="font-semibold text-sm">Captions</h3>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="default"
          size="sm"
          className="text-xs gap-1"
          onClick={autoGenerateCaptions}
        >
          <Sparkles className="size-3" />
          Auto-Generate from Script
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1"
          onClick={addManualCaption}
        >
          <Plus className="size-3" />
          Add
        </Button>
      </div>

      {/* Caption Style Editor */}
      <div className="space-y-3 rounded-lg bg-muted/50 p-3">
        <Label className="text-xs font-medium">Caption Style</Label>

        {/* Font */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Font</Label>
          <Select
            value={captionStyle.fontFamily}
            onValueChange={(v) => setCaptionStyle({ fontFamily: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((font) => (
                <SelectItem key={font} value={font}>
                  {font}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Size + Weight */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Size: {captionStyle.fontSize}px
            </Label>
            <Slider
              value={[captionStyle.fontSize]}
              onValueChange={([v]) => setCaptionStyle({ fontSize: v })}
              min={16}
              max={72}
              step={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Weight</Label>
            <Select
              value={captionStyle.fontWeight}
              onValueChange={(v: "normal" | "bold" | "extrabold") =>
                setCaptionStyle({ fontWeight: v })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
                <SelectItem value="extrabold">Extra Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Text</Label>
            <Input
              type="color"
              value={captionStyle.color}
              onChange={(e) => setCaptionStyle({ color: e.target.value })}
              className="h-8 p-1"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Background</Label>
            <Input
              type="color"
              value={captionStyle.backgroundColor}
              onChange={(e) =>
                setCaptionStyle({ backgroundColor: e.target.value })
              }
              className="h-8 p-1"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Outline</Label>
            <Input
              type="color"
              value={captionStyle.outlineColor}
              onChange={(e) =>
                setCaptionStyle({ outlineColor: e.target.value })
              }
              className="h-8 p-1"
            />
          </div>
        </div>

        {/* BG Opacity */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">
            Background Opacity: {captionStyle.backgroundOpacity}%
          </Label>
          <Slider
            value={[captionStyle.backgroundOpacity]}
            onValueChange={([v]) => setCaptionStyle({ backgroundOpacity: v })}
            min={0}
            max={100}
            step={5}
          />
        </div>

        {/* Position */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Position</Label>
          <div className="flex gap-1">
            {(["top", "center", "bottom"] as CaptionPosition[]).map((pos) => (
              <Button
                key={pos}
                variant={captionStyle.position === pos ? "default" : "outline"}
                size="sm"
                className="flex-1 text-[10px] h-7"
                onClick={() => setCaptionStyle({ position: pos })}
              >
                {pos === "top" && <ArrowUp className="size-3 mr-1" />}
                {pos === "center" && <MinusIcon className="size-3 mr-1" />}
                {pos === "bottom" && <ArrowDown className="size-3 mr-1" />}
                {pos}
              </Button>
            ))}
          </div>
        </div>

        {/* Alignment */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Alignment</Label>
          <div className="flex gap-1">
            {(
              [
                { id: "left", icon: AlignLeft },
                { id: "center", icon: AlignCenter },
                { id: "right", icon: AlignRight },
              ] as { id: CaptionAlignment; icon: React.ElementType }[]
            ).map(({ id, icon: Icon }) => (
              <Button
                key={id}
                variant={captionStyle.alignment === id ? "default" : "outline"}
                size="icon"
                className="size-7"
                onClick={() => setCaptionStyle({ alignment: id })}
              >
                <Icon className="size-3" />
              </Button>
            ))}
          </div>
        </div>

        {/* Animation */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Animation</Label>
          <Select
            value={captionStyle.animation}
            onValueChange={(v: CaptionAnimation) =>
              setCaptionStyle({ animation: v })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="fade-in">Fade In</SelectItem>
              <SelectItem value="slide-up">Slide Up</SelectItem>
              <SelectItem value="typewriter">Typewriter</SelectItem>
              <SelectItem value="pop">Pop</SelectItem>
              <SelectItem value="karaoke">Karaoke</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Caption list */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">
          Captions ({captions.length})
        </Label>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {captions.map((caption) => (
            <div
              key={caption.id}
              className={cn(
                "rounded-lg border p-2 cursor-pointer transition-colors",
                selectedCaptionId === caption.id
                  ? "border-primary bg-primary/5"
                  : "hover:border-muted-foreground/50"
              )}
              onClick={() => setSelectedCaption(caption.id)}
            >
              {editingId === caption.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={caption.text}
                    onChange={(e) =>
                      updateCaption(caption.id, { text: e.target.value })
                    }
                    className="text-xs min-h-[40px]"
                    rows={2}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Start</Label>
                      <Input
                        type="number"
                        value={caption.startTime.toFixed(1)}
                        onChange={(e) =>
                          updateCaption(caption.id, {
                            startTime: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-7 text-xs"
                        step={0.1}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">End</Label>
                      <Input
                        type="number"
                        value={caption.endTime.toFixed(1)}
                        onChange={(e) =>
                          updateCaption(caption.id, {
                            endTime: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-7 text-xs"
                        step={0.1}
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-6 w-full"
                    onClick={() => setEditingId(null)}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate">{caption.text}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {caption.startTime.toFixed(1)}s — {caption.endTime.toFixed(1)}s
                    </p>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(caption.id);
                      }}
                    >
                      <Edit3 className="size-2.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCaption(caption.id);
                      }}
                    >
                      <Trash2 className="size-2.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {captions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No captions. Click &ldquo;Auto-Generate&rdquo; to create from script.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
