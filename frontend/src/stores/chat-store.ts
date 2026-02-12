import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  GenerationSettings,
  GenerationMode,
  ModelSelection,
  AspectRatio,
  Duration,
  CameraSetup,
  LightingSetup,
  VideoStyle,
  Platform,
  Resolution,
  RealismFilters,
  ColorGrading,
} from "@/types/generation";
import { DEFAULT_GENERATION_SETTINGS } from "@/types/generation";

export interface MessageData {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ChatStore {
  // --- Existing chat state ---
  activeChatId: string | null;
  messages: MessageData[];
  isStreaming: boolean;
  streamingContent: string;
  setActiveChatId: (id: string | null) => void;
  setMessages: (messages: MessageData[]) => void;
  addMessage: (message: MessageData) => void;
  setStreaming: (streaming: boolean) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  resetStreaming: () => void;

  // --- Error state ---
  error: string | null;
  lastFailedContent: string | null;
  setError: (error: string, failedContent?: string) => void;
  clearError: () => void;

  // --- Generation settings state ---
  generationMode: GenerationMode;
  selectedModel: ModelSelection;
  aspectRatio: AspectRatio;
  duration: Duration;
  cameraSetup: CameraSetup;
  lightingSetup: LightingSetup;
  videoStyle: VideoStyle;
  platform: Platform;
  resolution: Resolution;
  realismFilters: RealismFilters;
  colorGrading: ColorGrading;
  selectedAvatarId: string | null;
  avatarReferenceImages: string[];
  avatarDNA: Record<string, string> | null;
  audioEnabled: boolean;
  isInputExpanded: boolean;
  productImages: string[];
  productName: string | null;
  backgroundSetting: string;

  // --- Script editing state ---
  activeJobId: string | null;
  editingScript: Record<number, Partial<{ description: string; dialogue: string; direction: string }>> | null;
  originalScript: Array<{ number: number; description: string; dialogue?: string; direction?: string }> | null;
  editedSceneNumbers: Set<number>;

  // --- Script editing actions ---
  setActiveJobId: (jobId: string | null) => void;
  setOriginalScript: (scenes: Array<{ number: number; description: string; dialogue?: string; direction?: string }>) => void;
  updateScene: (sceneNumber: number, updates: Partial<{ description: string; dialogue: string; direction: string }>) => void;
  resetSceneEdit: (sceneNumber: number) => void;
  resetAllEdits: () => void;
  getEditedScript: () => Array<{ number: number; description: string; dialogue?: string; direction?: string }> | null;

  // --- Generation settings actions ---
  setGenerationMode: (mode: GenerationMode) => void;
  setSelectedModel: (model: Partial<ModelSelection>) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setDuration: (duration: Duration) => void;
  setCameraSetup: (setup: Partial<CameraSetup>) => void;
  setLightingSetup: (setup: Partial<LightingSetup>) => void;
  setVideoStyle: (style: VideoStyle) => void;
  setPlatform: (platform: Platform) => void;
  setResolution: (resolution: Resolution) => void;
  setRealismFilters: (filters: Partial<RealismFilters>) => void;
  setColorGrading: (grading: ColorGrading) => void;
  setSelectedAvatarId: (id: string | null) => void;
  setAvatarReferenceImages: (images: string[]) => void;
  setAvatarDNA: (dna: Record<string, string> | null) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setInputExpanded: (expanded: boolean) => void;
  setProductImages: (images: string[]) => void;
  addProductImage: (url: string) => void;
  removeProductImage: (url: string) => void;
  clearProductImages: () => void;
  setProductName: (name: string | null) => void;
  setBackgroundSetting: (setting: string) => void;
  resetGenerationSettings: () => void;
  getGenerationSettings: () => GenerationSettings;
  loadFromJob: (jobData: Record<string, unknown>) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // --- Existing chat state ---
      activeChatId: null,
      messages: [],
      isStreaming: false,
      streamingContent: "",

      // --- Error state ---
      error: null,
      lastFailedContent: null,
      setError: (error, failedContent) => set({ error, lastFailedContent: failedContent ?? null }),
      clearError: () => set({ error: null, lastFailedContent: null }),

      setActiveChatId: (id) => set({ activeChatId: id }),

      setMessages: (messages) => set({ messages }),

      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      setStreamingContent: (content) => set({ streamingContent: content }),

      appendStreamingContent: (chunk) =>
        set((state) => ({ streamingContent: state.streamingContent + chunk })),

      resetStreaming: () => set({ isStreaming: false, streamingContent: "" }),

      // --- Generation settings state (defaults) ---
      ...DEFAULT_GENERATION_SETTINGS,
      avatarReferenceImages: [],
      avatarDNA: null,
      productImages: [],
      productName: null,
      backgroundSetting: "modern_bedroom",

      // --- Script editing state (defaults) ---
      activeJobId: null,
      editingScript: null,
      originalScript: null,
      editedSceneNumbers: new Set<number>(),

  // --- Script editing actions ---
  setActiveJobId: (jobId) => set({ activeJobId: jobId }),

  setOriginalScript: (scenes) =>
    set({ originalScript: scenes, editingScript: null, editedSceneNumbers: new Set() }),

  updateScene: (sceneNumber, updates) =>
    set((state) => {
      const newEdits = { ...state.editingScript, [sceneNumber]: { ...state.editingScript?.[sceneNumber], ...updates } };
      const newEdited = new Set(state.editedSceneNumbers);
      newEdited.add(sceneNumber);
      return { editingScript: newEdits, editedSceneNumbers: newEdited };
    }),

  resetSceneEdit: (sceneNumber) =>
    set((state) => {
      const newEdits = { ...state.editingScript };
      delete newEdits[sceneNumber];
      const newEdited = new Set(state.editedSceneNumbers);
      newEdited.delete(sceneNumber);
      return {
        editingScript: Object.keys(newEdits).length > 0 ? newEdits : null,
        editedSceneNumbers: newEdited,
      };
    }),

  resetAllEdits: () =>
    set({ editingScript: null, editedSceneNumbers: new Set() }),

  getEditedScript: () => {
    const state = get();
    if (!state.originalScript) return null;
    if (!state.editingScript) return state.originalScript;
    return state.originalScript.map((scene) => {
      const edits = state.editingScript?.[scene.number];
      return edits ? { ...scene, ...edits } : scene;
    });
  },

  // --- Generation settings actions ---
  setGenerationMode: (mode) => set({ generationMode: mode }),

  setSelectedModel: (model) =>
    set((state) => ({
      selectedModel: { ...state.selectedModel, ...model },
    })),

  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),

  setDuration: (duration) => set({ duration }),

  setCameraSetup: (setup) =>
    set((state) => ({
      cameraSetup: { ...state.cameraSetup, ...setup },
    })),

  setLightingSetup: (setup) =>
    set((state) => ({
      lightingSetup: { ...state.lightingSetup, ...setup },
    })),

  setVideoStyle: (style) => set({ videoStyle: style }),

  setPlatform: (platform) => set({ platform }),

  setResolution: (resolution) => set({ resolution }),

  setRealismFilters: (filters) =>
    set((state) => ({
      realismFilters: { ...state.realismFilters, ...filters },
    })),

  setColorGrading: (grading) => set({ colorGrading: grading }),

  setSelectedAvatarId: (id) => set({ selectedAvatarId: id }),

  setAvatarReferenceImages: (images) => set({ avatarReferenceImages: images }),

  setAvatarDNA: (dna) => set({ avatarDNA: dna }),

  setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),

  setInputExpanded: (expanded) => set({ isInputExpanded: expanded }),

  setProductImages: (images) => set({ productImages: images }),

  addProductImage: (url) =>
    set((state) => ({ productImages: [...state.productImages, url] })),

  removeProductImage: (url) =>
    set((state) => ({
      productImages: state.productImages.filter((img) => img !== url),
    })),

  clearProductImages: () => set({ productImages: [] }),

  setProductName: (name) => set({ productName: name }),

  setBackgroundSetting: (setting) => set({ backgroundSetting: setting }),

  resetGenerationSettings: () => set({ ...DEFAULT_GENERATION_SETTINGS, avatarReferenceImages: [], avatarDNA: null, productImages: [], productName: null, backgroundSetting: "modern_bedroom" }),

  getGenerationSettings: () => {
    const state = get();
    return {
      generationMode: state.generationMode,
      selectedModel: state.selectedModel,
      aspectRatio: state.aspectRatio,
      duration: state.duration,
      cameraSetup: state.cameraSetup,
      lightingSetup: state.lightingSetup,
      videoStyle: state.videoStyle,
      platform: state.platform,
      resolution: state.resolution,
      realismFilters: state.realismFilters,
      colorGrading: state.colorGrading,
      selectedAvatarId: state.selectedAvatarId,
      avatarReferenceImages: state.avatarReferenceImages,
      avatarDNA: state.avatarDNA,
      audioEnabled: state.audioEnabled,
      isInputExpanded: state.isInputExpanded,
      productImages: state.productImages,
      productName: state.productName,
      backgroundSetting: state.backgroundSetting,
    };
  },

  loadFromJob: (jobData) => {
    const settings = (jobData.generationSettings as Record<string, unknown>) || {};
    set({
      activeJobId: jobData.jobId as string || null,
      selectedAvatarId: (jobData.avatarId as string) || (settings.selectedAvatarId as string) || null,
      avatarDNA: (jobData.avatarDNA as Record<string, string>) || null,
      avatarReferenceImages: (jobData.avatarRefImages as string[]) || [],
      productImages: (jobData.productImages as string[]) || [],
      productName: (jobData.productName as string) || null,
      backgroundSetting: (jobData.backgroundSetting as string) || "modern_bedroom",
      platform: (jobData.platform as Platform) || (settings.platform as Platform) || "instagram_reels",
      aspectRatio: (settings.aspectRatio as AspectRatio) || "9:16",
      duration: (settings.duration as Duration) || 30,
      videoStyle: (settings.videoStyle as VideoStyle) || "professional",
    });

    // Also load script if available
    if (jobData.script) {
      const script = jobData.script as Record<string, unknown>;
      const scenes = script.scenes as Array<{ number: number; description: string; dialogue?: string; direction?: string }>;
      if (scenes) {
        get().setOriginalScript(scenes);
      }
    }
  },
    }),
    {
      name: "ugc-generation-settings",
      partialize: (state) => ({
        // Only persist generation settings, not chat state
        generationMode: state.generationMode,
        selectedModel: state.selectedModel,
        aspectRatio: state.aspectRatio,
        duration: state.duration,
        cameraSetup: state.cameraSetup,
        lightingSetup: state.lightingSetup,
        videoStyle: state.videoStyle,
        platform: state.platform,
        resolution: state.resolution,
        realismFilters: state.realismFilters,
        colorGrading: state.colorGrading,
        selectedAvatarId: state.selectedAvatarId,
        avatarReferenceImages: state.avatarReferenceImages,
        avatarDNA: state.avatarDNA,
        audioEnabled: state.audioEnabled,
        productImages: state.productImages,
        productName: state.productName,
        backgroundSetting: state.backgroundSetting,
      }),
    }
  )
);
