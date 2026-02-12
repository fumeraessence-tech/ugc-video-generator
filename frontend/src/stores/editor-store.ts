/**
 * Video Editor Store
 *
 * Zustand store for the post-production video editor.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  TimelineClip,
  TimelineTransition,
  AudioClip,
  Caption,
  CaptionStyle,
  VoiceConfig,
  EditorPanel,
  PlaybackState,
  ExportSettings,
  ExportProgress,
  ScriptSceneData,
  AspectRatio,
  CropSettings,
} from "@/types/editor";
import {
  DEFAULT_CAPTION_STYLE,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_VOICE_CONFIG,
} from "@/types/editor";

interface EditorStore {
  // ---- Source data (from wizard) ----
  projectId: string | null;
  sceneClips: Record<number, TimelineClip[]>;
  scriptScenes: ScriptSceneData[];

  // ---- Timeline state ----
  timelineClips: TimelineClip[];
  transitions: TimelineTransition[];

  // ---- Playback ----
  playbackState: PlaybackState;
  currentTime: number;
  zoom: number;
  aspectRatio: AspectRatio;

  // ---- Audio ----
  voiceoverClips: AudioClip[];
  musicClips: AudioClip[];
  sfxClips: AudioClip[];
  masterVolume: number;
  voiceConfig: VoiceConfig;

  // ---- Captions ----
  captions: Caption[];
  captionStyle: CaptionStyle;

  // ---- UI ----
  activePanel: EditorPanel;
  selectedClipId: string | null;
  selectedCaptionId: string | null;
  selectedAudioId: string | null;

  // ---- Export ----
  exportSettings: ExportSettings;
  exportProgress: ExportProgress;

  // ---- Computed ----
  getTotalDuration: () => number;

  // ---- Actions: Initialization ----
  initializeFromWizard: (data: {
    sceneClips: Record<number, TimelineClip[]>;
    scriptScenes: ScriptSceneData[];
    projectId: string;
  }) => void;

  // ---- Actions: Timeline ----
  addClipToTimeline: (clip: TimelineClip) => void;
  removeClipFromTimeline: (clipId: string) => void;
  reorderClips: (clipIds: string[]) => void;
  updateClipTrim: (clipId: string, trimStart: number, trimEnd: number) => void;
  replaceClip: (oldClipId: string, newClip: TimelineClip) => void;

  // ---- Actions: Transitions ----
  setTransition: (afterClipId: string, transition: TimelineTransition) => void;
  removeTransition: (transitionId: string) => void;

  // ---- Actions: Playback ----
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setZoom: (zoom: number) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setClipCrop: (clipId: string, crop: CropSettings) => void;

  // ---- Actions: Audio ----
  addAudioClip: (clip: AudioClip) => void;
  removeAudioClip: (clipId: string) => void;
  updateAudioClip: (clipId: string, updates: Partial<AudioClip>) => void;
  setMasterVolume: (volume: number) => void;
  setVoiceConfig: (config: Partial<VoiceConfig>) => void;

  // ---- Actions: Captions ----
  setCaptions: (captions: Caption[]) => void;
  addCaption: (caption: Caption) => void;
  updateCaption: (captionId: string, updates: Partial<Caption>) => void;
  removeCaption: (captionId: string) => void;
  setCaptionStyle: (style: Partial<CaptionStyle>) => void;

  // ---- Actions: UI ----
  setActivePanel: (panel: EditorPanel) => void;
  setSelectedClip: (clipId: string | null) => void;
  setSelectedCaption: (captionId: string | null) => void;
  setSelectedAudio: (audioId: string | null) => void;

  // ---- Actions: Export ----
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  setExportProgress: (progress: Partial<ExportProgress>) => void;

  // ---- Actions: Reset ----
  reset: () => void;
}

const initialState = {
  projectId: null as string | null,
  sceneClips: {} as Record<number, TimelineClip[]>,
  scriptScenes: [] as ScriptSceneData[],
  timelineClips: [] as TimelineClip[],
  transitions: [] as TimelineTransition[],
  playbackState: "stopped" as PlaybackState,
  currentTime: 0,
  zoom: 4,
  aspectRatio: "9:16" as AspectRatio,
  voiceoverClips: [] as AudioClip[],
  musicClips: [] as AudioClip[],
  sfxClips: [] as AudioClip[],
  masterVolume: 80,
  voiceConfig: DEFAULT_VOICE_CONFIG,
  captions: [] as Caption[],
  captionStyle: DEFAULT_CAPTION_STYLE,
  activePanel: "properties" as EditorPanel,
  selectedClipId: null as string | null,
  selectedCaptionId: null as string | null,
  selectedAudioId: null as string | null,
  exportSettings: DEFAULT_EXPORT_SETTINGS,
  exportProgress: {
    status: "idle",
    percent: 0,
    message: "",
  } as ExportProgress,
};

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Computed
      getTotalDuration: () => {
        const clips = get().timelineClips;
        const transitions = get().transitions;
        let total = clips.reduce(
          (sum, c) => sum + (c.duration - c.trimStart - c.trimEnd),
          0
        );
        // Subtract transition overlap
        total -= transitions.reduce((sum, t) => sum + t.transition.duration, 0);
        return Math.max(0, total);
      },

      // Initialization
      initializeFromWizard: (data) =>
        set({
          projectId: data.projectId,
          sceneClips: data.sceneClips,
          scriptScenes: data.scriptScenes,
          // Auto-populate timeline with first clip from each scene
          timelineClips: Object.entries(data.sceneClips)
            .sort(([a], [b]) => Number(a) - Number(b))
            .flatMap(([, clips]) => (clips[0] ? [clips[0]] : []))
            .map((clip, idx) => ({ ...clip, order: idx })),
          transitions: [],
          captions: [],
          voiceoverClips: [],
          musicClips: [],
          sfxClips: [],
        }),

      // Timeline
      addClipToTimeline: (clip) =>
        set((state) => ({
          timelineClips: [
            ...state.timelineClips,
            { ...clip, order: state.timelineClips.length },
          ],
        })),

      removeClipFromTimeline: (clipId) =>
        set((state) => ({
          timelineClips: state.timelineClips
            .filter((c) => c.id !== clipId)
            .map((c, i) => ({ ...c, order: i })),
          transitions: state.transitions.filter(
            (t) => t.afterClipId !== clipId
          ),
          selectedClipId:
            state.selectedClipId === clipId ? null : state.selectedClipId,
        })),

      reorderClips: (clipIds) =>
        set((state) => {
          const clipMap = new Map(state.timelineClips.map((c) => [c.id, c]));
          const reordered = clipIds
            .map((id) => clipMap.get(id))
            .filter(Boolean) as TimelineClip[];
          return {
            timelineClips: reordered.map((c, i) => ({ ...c, order: i })),
          };
        }),

      updateClipTrim: (clipId, trimStart, trimEnd) =>
        set((state) => ({
          timelineClips: state.timelineClips.map((c) =>
            c.id === clipId ? { ...c, trimStart, trimEnd } : c
          ),
        })),

      replaceClip: (oldClipId, newClip) =>
        set((state) => ({
          timelineClips: state.timelineClips.map((c) =>
            c.id === oldClipId ? { ...newClip, order: c.order } : c
          ),
        })),

      // Transitions
      setTransition: (afterClipId, transition) =>
        set((state) => {
          const existing = state.transitions.findIndex(
            (t) => t.afterClipId === afterClipId
          );
          if (existing >= 0) {
            const updated = [...state.transitions];
            updated[existing] = transition;
            return { transitions: updated };
          }
          return { transitions: [...state.transitions, transition] };
        }),

      removeTransition: (transitionId) =>
        set((state) => ({
          transitions: state.transitions.filter((t) => t.id !== transitionId),
        })),

      // Playback
      play: () => set({ playbackState: "playing" }),
      pause: () => set({ playbackState: "paused" }),
      stop: () => set({ playbackState: "stopped", currentTime: 0 }),
      seek: (time) => set({ currentTime: time }),
      setZoom: (zoom) => set({ zoom: Math.max(1, Math.min(10, zoom)) }),
      setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
      setClipCrop: (clipId, crop) =>
        set((state) => ({
          timelineClips: state.timelineClips.map((c) =>
            c.id === clipId ? { ...c, crop } : c
          ),
        })),

      // Audio
      addAudioClip: (clip) =>
        set((state) => {
          const key =
            clip.type === "voiceover"
              ? "voiceoverClips"
              : clip.type === "music"
                ? "musicClips"
                : "sfxClips";
          return { [key]: [...state[key], clip] };
        }),

      removeAudioClip: (clipId) =>
        set((state) => ({
          voiceoverClips: state.voiceoverClips.filter((c) => c.id !== clipId),
          musicClips: state.musicClips.filter((c) => c.id !== clipId),
          sfxClips: state.sfxClips.filter((c) => c.id !== clipId),
          selectedAudioId:
            state.selectedAudioId === clipId ? null : state.selectedAudioId,
        })),

      updateAudioClip: (clipId, updates) =>
        set((state) => {
          const updateList = (list: AudioClip[]) =>
            list.map((c) => (c.id === clipId ? { ...c, ...updates } : c));
          return {
            voiceoverClips: updateList(state.voiceoverClips),
            musicClips: updateList(state.musicClips),
            sfxClips: updateList(state.sfxClips),
          };
        }),

      setMasterVolume: (volume) => set({ masterVolume: volume }),

      setVoiceConfig: (config) =>
        set((state) => ({
          voiceConfig: { ...state.voiceConfig, ...config },
        })),

      // Captions
      setCaptions: (captions) => set({ captions }),

      addCaption: (caption) =>
        set((state) => ({ captions: [...state.captions, caption] })),

      updateCaption: (captionId, updates) =>
        set((state) => ({
          captions: state.captions.map((c) =>
            c.id === captionId ? { ...c, ...updates } : c
          ),
        })),

      removeCaption: (captionId) =>
        set((state) => ({
          captions: state.captions.filter((c) => c.id !== captionId),
          selectedCaptionId:
            state.selectedCaptionId === captionId
              ? null
              : state.selectedCaptionId,
        })),

      setCaptionStyle: (style) =>
        set((state) => ({
          captionStyle: { ...state.captionStyle, ...style },
        })),

      // UI
      setActivePanel: (panel) => set({ activePanel: panel }),
      setSelectedClip: (clipId) => set({ selectedClipId: clipId }),
      setSelectedCaption: (captionId) => set({ selectedCaptionId: captionId }),
      setSelectedAudio: (audioId) => set({ selectedAudioId: audioId }),

      // Export
      setExportSettings: (settings) =>
        set((state) => ({
          exportSettings: { ...state.exportSettings, ...settings },
        })),

      setExportProgress: (progress) =>
        set((state) => ({
          exportProgress: { ...state.exportProgress, ...progress },
        })),

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: "video-editor",
      partialize: (state) => ({
        projectId: state.projectId,
        sceneClips: state.sceneClips,
        scriptScenes: state.scriptScenes,
        timelineClips: state.timelineClips,
        transitions: state.transitions,
        voiceoverClips: state.voiceoverClips,
        musicClips: state.musicClips,
        sfxClips: state.sfxClips,
        captions: state.captions,
        captionStyle: state.captionStyle,
        voiceConfig: state.voiceConfig,
        exportSettings: state.exportSettings,
        zoom: state.zoom,
        aspectRatio: state.aspectRatio,
        masterVolume: state.masterVolume,
      }),
    }
  )
);
