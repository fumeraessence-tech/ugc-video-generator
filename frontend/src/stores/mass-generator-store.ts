/**
 * Mass Script Generator Store
 *
 * Zustand store for managing the step-by-step wizard state.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  WizardStep,
  WizardState,
  ProductDNA,
  AvatarDNA,
  CreativeBrief,
  ProductionBible,
  Script,
  Platform,
  VideoStyle,
  Tone,
} from "@/types/mass-generator";

interface MassGeneratorStore extends WizardState {
  // Avatar reference images state (not in WizardState type)
  avatarReferenceImages: string[];

  // Navigation
  setCurrentStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Product
  setProductImages: (images: string[]) => void;
  addProductImage: (url: string) => void;
  removeProductImage: (url: string) => void;
  setProductName: (name: string) => void;
  setBrandName: (name: string) => void;
  setProductDNA: (dna: ProductDNA | null) => void;

  // Avatar
  setSelectedAvatarId: (id: string | null) => void;
  setAvatarDNA: (dna: AvatarDNA | null) => void;
  setAvatarReferenceImages: (images: string[]) => void;

  // Style
  setPlatform: (platform: Platform) => void;
  setStyle: (style: VideoStyle) => void;
  setTone: (tone: Tone) => void;
  setDuration: (duration: number) => void;

  // Brief
  setUserPrompt: (prompt: string) => void;
  setCreativeBrief: (brief: CreativeBrief | null) => void;

  // Production
  setProductionBible: (bible: ProductionBible | null) => void;
  setScript: (script: Script | null) => void;

  // Status
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Reset
  reset: () => void;
}

const STEPS: WizardStep[] = ["product", "avatar", "brief", "script", "generate", "video"];

const initialState: Pick<MassGeneratorStore,
  'currentStep' | 'productImages' | 'productName' | 'brandName' | 'productDNA' |
  'selectedAvatarId' | 'avatarDNA' | 'avatarReferenceImages' | 'platform' | 'style' |
  'tone' | 'duration' | 'userPrompt' | 'creativeBrief' | 'productionBible' | 'script' |
  'isLoading' | 'error'
> = {
  currentStep: "product" as const,
  productImages: [],
  productName: "",
  brandName: "",
  productDNA: null,
  selectedAvatarId: null,
  avatarDNA: null,
  avatarReferenceImages: [],
  platform: "instagram_reels" as const,
  style: "testimonial" as const,
  tone: "excited" as const,
  duration: 30,
  userPrompt: "",
  creativeBrief: null,
  productionBible: null,
  script: null,
  isLoading: false,
  error: null,
};

export const useMassGeneratorStore = create<MassGeneratorStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Navigation
      setCurrentStep: (step) => set({ currentStep: step }),

      nextStep: () => {
        const currentIndex = STEPS.indexOf(get().currentStep);
        if (currentIndex < STEPS.length - 1) {
          set({ currentStep: STEPS[currentIndex + 1] });
        }
      },

      prevStep: () => {
        const currentIndex = STEPS.indexOf(get().currentStep);
        if (currentIndex > 0) {
          set({ currentStep: STEPS[currentIndex - 1] });
        }
      },

      // Product
      setProductImages: (images) => set({ productImages: images }),

      addProductImage: (url) =>
        set((state) => ({
          productImages: [...state.productImages, url],
        })),

      removeProductImage: (url) =>
        set((state) => ({
          productImages: state.productImages.filter((img) => img !== url),
        })),

      setProductName: (name) => set({ productName: name }),

      setBrandName: (name) => set({ brandName: name }),

      setProductDNA: (dna) => set({ productDNA: dna }),

      // Avatar
      setSelectedAvatarId: (id) => set({ selectedAvatarId: id }),

      setAvatarDNA: (dna) => set({ avatarDNA: dna }),

      setAvatarReferenceImages: (images) => set({ avatarReferenceImages: images }),

      // Style
      setPlatform: (platform) => set({ platform }),

      setStyle: (style) => set({ style }),

      setTone: (tone) => set({ tone }),

      setDuration: (duration) => set({ duration }),

      // Brief
      setUserPrompt: (prompt) => set({ userPrompt: prompt }),

      setCreativeBrief: (brief) => set({ creativeBrief: brief }),

      // Production
      setProductionBible: (bible) => set({ productionBible: bible }),

      setScript: (script) => set({ script }),

      // Status
      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: "mass-generator-wizard",
      partialize: (state) => ({
        // Persist wizard progress
        currentStep: state.currentStep,
        productImages: state.productImages,
        productName: state.productName,
        brandName: state.brandName,
        productDNA: state.productDNA,
        selectedAvatarId: state.selectedAvatarId,
        avatarReferenceImages: state.avatarReferenceImages,
        platform: state.platform,
        style: state.style,
        tone: state.tone,
        duration: state.duration,
        userPrompt: state.userPrompt,
        creativeBrief: state.creativeBrief,
        // Don't persist loading/error states
      }),
    }
  )
);
