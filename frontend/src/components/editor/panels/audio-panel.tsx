"use client";

import { useState } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mic, Play, Trash2, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VOICE_OPTIONS = [
  { value: "en-US-Studio-O", label: "Studio O (Male)" },
  { value: "en-US-Studio-Q", label: "Studio Q (Male)" },
  { value: "en-US-Studio-N", label: "Studio N (Female)" },
  { value: "en-US-Studio-M", label: "Studio M (Female)" },
  { value: "en-US-Wavenet-D", label: "Wavenet D (Male)" },
  { value: "en-US-Wavenet-F", label: "Wavenet F (Female)" },
];

export function AudioPanel() {
  const {
    scriptScenes,
    voiceoverClips,
    voiceConfig,
    setVoiceConfig,
    addAudioClip,
    removeAudioClip,
    updateAudioClip,
    timelineClips,
  } = useEditorStore();

  const [generatingScene, setGeneratingScene] = useState<number | null>(null);

  const generateVoiceover = async (sceneNumber: number, dialogue: string) => {
    setGeneratingScene(sceneNumber);
    try {
      const response = await fetch("/api/editor/generate-voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_number: sceneNumber,
          text: dialogue,
          language_code: voiceConfig.languageCode,
          voice_name: voiceConfig.voiceName,
          pitch: voiceConfig.pitch,
          speaking_rate: voiceConfig.speakingRate,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate voiceover");

      const data = await response.json();

      // Calculate start time based on clip position in timeline
      let startTime = 0;
      for (const clip of timelineClips) {
        if (clip.sceneNumber === sceneNumber) break;
        startTime += clip.duration - clip.trimStart - clip.trimEnd;
      }

      // Remove existing voiceover for this scene
      const existing = voiceoverClips.find(
        (c) => c.sceneNumber === sceneNumber
      );
      if (existing) removeAudioClip(existing.id);

      addAudioClip({
        id: `vo-scene-${sceneNumber}-${Date.now()}`,
        type: "voiceover",
        url: data.audio_url,
        filename: `voiceover-scene-${sceneNumber}.mp3`,
        duration: data.duration_seconds,
        volume: 100,
        startTime,
        trimStart: 0,
        trimEnd: 0,
        fadeIn: 0,
        fadeOut: 0,
        sceneNumber,
        label: `Scene ${sceneNumber} VO`,
      });
    } catch (error) {
      console.error("Voiceover generation failed:", error);
    } finally {
      setGeneratingScene(null);
    }
  };

  return (
    <div className="space-y-5">
      <h3 className="font-semibold text-sm">Voiceover & Audio</h3>

      {/* Voice Configuration */}
      <div className="space-y-3 rounded-lg bg-muted/50 p-3">
        <Label className="text-xs font-medium">Voice Settings</Label>

        <div className="space-y-2">
          <Label className="text-[11px] text-muted-foreground">Voice</Label>
          <Select
            value={voiceConfig.voiceName}
            onValueChange={(v) => setVoiceConfig({ voiceName: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Pitch: {voiceConfig.pitch > 0 ? "+" : ""}
              {voiceConfig.pitch.toFixed(1)}
            </Label>
            <Slider
              value={[voiceConfig.pitch]}
              onValueChange={([v]) => setVoiceConfig({ pitch: v })}
              min={-5}
              max={5}
              step={0.5}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Speed: {voiceConfig.speakingRate.toFixed(1)}x
            </Label>
            <Slider
              value={[voiceConfig.speakingRate]}
              onValueChange={([v]) => setVoiceConfig({ speakingRate: v })}
              min={0.5}
              max={2.0}
              step={0.1}
            />
          </div>
        </div>
      </div>

      {/* Per-Scene Voiceover */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Scene Voiceovers</Label>
        {scriptScenes.map((scene) => {
          const existingVO = voiceoverClips.find(
            (c) => c.sceneNumber === scene.sceneNumber
          );
          const isGenerating = generatingScene === scene.sceneNumber;

          return (
            <div
              key={scene.sceneNumber}
              className="rounded-lg border p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">
                  Scene {scene.sceneNumber}
                </span>
                {existingVO && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => removeAudioClip(existingVO.id)}
                  >
                    <Trash2 className="size-3 text-destructive" />
                  </Button>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground line-clamp-2">
                &ldquo;{scene.dialogue}&rdquo;
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant={existingVO ? "outline" : "default"}
                  size="sm"
                  className="text-xs gap-1 h-7"
                  disabled={isGenerating || !scene.dialogue}
                  onClick={() =>
                    generateVoiceover(scene.sceneNumber, scene.dialogue)
                  }
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Mic className="size-3" />
                      {existingVO ? "Regenerate" : "Generate"}
                    </>
                  )}
                </Button>

                {existingVO && (
                  <div className="flex items-center gap-1.5 flex-1">
                    <Volume2 className="size-3 text-muted-foreground" />
                    <Slider
                      value={[existingVO.volume]}
                      onValueChange={([v]) =>
                        updateAudioClip(existingVO.id, { volume: v })
                      }
                      min={0}
                      max={100}
                      step={1}
                      className="flex-1"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {scriptScenes.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No scenes available. Initialize from the wizard first.
          </p>
        )}
      </div>
    </div>
  );
}
