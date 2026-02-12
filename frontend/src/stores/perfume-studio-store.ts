/**
 * Perfume Studio Store (V2)
 *
 * Zustand store for the step-based perfume image generation pipeline.
 * Supports gender-specific avatars, inspiration analysis, configurable
 * image counts, and full batch job control.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Type Definitions ────────────────────────────────────────────

export interface PerfumeNotes {
  top: string[];
  middle: string[];
  base: string[];
  description: string;
}

export interface PerfumeGeneratedImage {
  style: string;
  label: string;
  image_url: string;
  prompt: string;
}

export interface PerfumeProductDNA {
  product_type: string;
  product_name: string;
  colors_primary: string;
  colors_secondary: string;
  bottle_shape: string;
  bottle_material: string;
  bottle_size: string;
  cap_design: string;
  label_design: string;
  liquid_color: string;
  distinctive_features: string[];
  visual_description: string;
  prohibited_variations: string[];
}

export interface PerfumeAvatarDNA {
  gender: string;
  face: string;
  skin: string;
  eyes: string;
  hair: string;
  body: string;
  ethnicity: string;
  age_range: string;
  wardrobe: string;
  prohibited_drift: string;
}

export interface InspirationDNA {
  color_palettes: string[];
  lighting_styles: string[];
  composition_patterns: string[];
  prop_usage: string[];
  background_styles: string[];
  mood_aesthetic: string[];
  camera_angles: string[];
  textures_materials: string[];
  overall_summary: string;
}

export interface GenderAvatarSlot {
  images: string[];
  dna: PerfumeAvatarDNA | null;
  isExtracting: boolean;
}

export interface CSVProduct {
  perfume_name: string;
  cleaned_name: string;
  brand_name: string;
  inspired_by: string;
  gender: string;
  description: string;
  notes: PerfumeNotes;
  row_number: number;
}

export interface BatchProductResult {
  perfume_name: string;
  brand_name: string;
  product_index: number;
  status: "success" | "error" | "pending" | "generating";
  images: PerfumeGeneratedImage[];
  count: number;
  error?: string;
}

export type WizardStep =
  | "references"
  | "csv"
  | "avatars"
  | "inspiration"
  | "configure"
  | "generate"
  | "review"
  | "history";

export const WIZARD_STEPS: { key: WizardStep; label: string; number: number }[] = [
  { key: "references", label: "References", number: 1 },
  { key: "csv", label: "Products", number: 2 },
  { key: "avatars", label: "Avatars", number: 3 },
  { key: "inspiration", label: "Inspiration", number: 4 },
  { key: "configure", label: "Configure", number: 5 },
  { key: "generate", label: "Generate", number: 6 },
  { key: "review", label: "Review", number: 7 },
  { key: "history", label: "History", number: 8 },
];

// ─── Store Interface ─────────────────────────────────────────────

interface PerfumeStudioStore {
  // Wizard navigation
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Step 1: Reference images (persisted)
  bottleImage: string | null;
  capImage: string | null;
  labelImages: string[];
  setBottleImage: (url: string | null) => void;
  setCapImage: (url: string | null) => void;
  setLabelImages: (urls: string[]) => void;
  addLabelImage: (url: string) => void;
  removeLabelImage: (url: string) => void;

  // Step 1: Product DNA (persisted)
  productDNA: PerfumeProductDNA | null;
  isExtractingProductDNA: boolean;
  setProductDNA: (dna: PerfumeProductDNA | null) => void;
  setIsExtractingProductDNA: (value: boolean) => void;

  // Step 2: CSV Products (not persisted)
  csvProducts: CSVProduct[];
  csvFileName: string | null;
  selectedProductIndices: number[];
  setCsvProducts: (products: CSVProduct[]) => void;
  setCsvFileName: (name: string | null) => void;
  setSelectedProductIndices: (indices: number[]) => void;
  toggleProductIndex: (index: number) => void;
  selectAllProducts: () => void;
  deselectAllProducts: () => void;

  // Step 3: Gender-specific avatars (persisted)
  maleAvatar: GenderAvatarSlot;
  femaleAvatar: GenderAvatarSlot;
  unisexAvatar: GenderAvatarSlot;
  setAvatarImages: (gender: "male" | "female" | "unisex", images: string[]) => void;
  addAvatarImage: (gender: "male" | "female" | "unisex", url: string) => void;
  removeAvatarImage: (gender: "male" | "female" | "unisex", url: string) => void;
  setAvatarDNA: (gender: "male" | "female" | "unisex", dna: PerfumeAvatarDNA | null) => void;
  setAvatarExtracting: (gender: "male" | "female" | "unisex", value: boolean) => void;

  // Step 4: Inspiration images (persisted URLs, DNA not persisted)
  inspirationImages: string[];
  inspirationDNA: InspirationDNA | null;
  isAnalyzingInspiration: boolean;
  setInspirationImages: (urls: string[]) => void;
  addInspirationImages: (urls: string[]) => void;
  removeInspirationImage: (url: string) => void;
  setInspirationDNA: (dna: InspirationDNA | null) => void;
  setIsAnalyzingInspiration: (value: boolean) => void;

  // Step 5: Configuration (persisted)
  imagesPerProduct: number;
  aspectRatio: string;
  setImagesPerProduct: (count: number) => void;
  setAspectRatio: (ratio: string) => void;

  // Step 6: Generation status (not persisted)
  batchJobId: string | null;
  batchStatus: string;
  batchProgress: number;
  batchMessage: string;
  batchPaused: boolean;
  currentProductName: string;
  completedCount: number;
  totalProducts: number;
  setBatchJobId: (id: string | null) => void;
  setBatchStatus: (status: string) => void;
  setBatchProgress: (progress: number) => void;
  setBatchMessage: (message: string) => void;
  setBatchPaused: (paused: boolean) => void;
  setCurrentProductName: (name: string) => void;
  setCompletedCount: (count: number) => void;
  setTotalProducts: (count: number) => void;

  // Step 7: Results (not persisted)
  batchResults: BatchProductResult[];
  setBatchResults: (results: BatchProductResult[]) => void;
  updateBatchResult: (productIndex: number, result: BatchProductResult) => void;

  // Legacy compat fields
  perfumeName: string;
  brandName: string;
  inspiredBy: string;
  gender: "male" | "female" | "unisex";
  notes: PerfumeNotes | null;
  isGenerating: boolean;
  isFetchingNotes: boolean;
  regeneratingStyles: string[];
  generatedImages: PerfumeGeneratedImage[];
  error: string | null;

  setPerfumeName: (name: string) => void;
  setBrandName: (name: string) => void;
  setInspiredBy: (value: string) => void;
  setGender: (gender: "male" | "female" | "unisex") => void;
  setNotes: (notes: PerfumeNotes | null) => void;
  setIsGenerating: (value: boolean) => void;
  setIsFetchingNotes: (value: boolean) => void;
  addRegeneratingStyle: (style: string) => void;
  removeRegeneratingStyle: (style: string) => void;
  setGeneratedImages: (images: PerfumeGeneratedImage[]) => void;
  setError: (error: string | null) => void;

  // Helpers
  getAllReferenceImages: () => string[];
  getGenderAvatars: () => {
    male: { images: string[]; dna: PerfumeAvatarDNA | null };
    female: { images: string[]; dna: PerfumeAvatarDNA | null };
    unisex: { images: string[]; dna: PerfumeAvatarDNA | null };
  };
  clearBatch: () => void;
  reset: () => void;
}

// ─── Initial State ───────────────────────────────────────────────

const emptyAvatarSlot: GenderAvatarSlot = {
  images: [],
  dna: null,
  isExtracting: false,
};

const initialState = {
  currentStep: "references" as WizardStep,

  // Step 1
  bottleImage: null as string | null,
  capImage: null as string | null,
  labelImages: [] as string[],
  productDNA: null as PerfumeProductDNA | null,
  isExtractingProductDNA: false,

  // Step 2
  csvProducts: [] as CSVProduct[],
  csvFileName: null as string | null,
  selectedProductIndices: [] as number[],

  // Step 3
  maleAvatar: { ...emptyAvatarSlot },
  femaleAvatar: { ...emptyAvatarSlot },
  unisexAvatar: { ...emptyAvatarSlot },

  // Step 4
  inspirationImages: [] as string[],
  inspirationDNA: null as InspirationDNA | null,
  isAnalyzingInspiration: false,

  // Step 5
  imagesPerProduct: 8,
  aspectRatio: "1:1",

  // Step 6
  batchJobId: null as string | null,
  batchStatus: "",
  batchProgress: 0,
  batchMessage: "",
  batchPaused: false,
  currentProductName: "",
  completedCount: 0,
  totalProducts: 0,

  // Step 7
  batchResults: [] as BatchProductResult[],

  // Legacy compat
  perfumeName: "",
  brandName: "",
  inspiredBy: "",
  gender: "unisex" as const,
  notes: null as PerfumeNotes | null,
  isGenerating: false,
  isFetchingNotes: false,
  regeneratingStyles: [] as string[],
  generatedImages: [] as PerfumeGeneratedImage[],
  error: null as string | null,
};

// ─── Store Creation ──────────────────────────────────────────────

export const usePerfumeStudioStore = create<PerfumeStudioStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Wizard navigation
      setCurrentStep: (step) => set({ currentStep: step }),
      nextStep: () => {
        const steps = WIZARD_STEPS.map((s) => s.key);
        const idx = steps.indexOf(get().currentStep);
        if (idx < steps.length - 1) set({ currentStep: steps[idx + 1] });
      },
      prevStep: () => {
        const steps = WIZARD_STEPS.map((s) => s.key);
        const idx = steps.indexOf(get().currentStep);
        if (idx > 0) set({ currentStep: steps[idx - 1] });
      },

      // Step 1: Reference images
      setBottleImage: (url) => set({ bottleImage: url }),
      setCapImage: (url) => set({ capImage: url }),
      setLabelImages: (urls) => set({ labelImages: urls }),
      addLabelImage: (url) =>
        set((s) => ({ labelImages: [...s.labelImages, url] })),
      removeLabelImage: (url) =>
        set((s) => ({ labelImages: s.labelImages.filter((u) => u !== url) })),

      // Step 1: Product DNA
      setProductDNA: (dna) => set({ productDNA: dna }),
      setIsExtractingProductDNA: (value) => set({ isExtractingProductDNA: value }),

      // Step 2: CSV Products
      setCsvProducts: (products) => set({ csvProducts: products }),
      setCsvFileName: (name) => set({ csvFileName: name }),
      setSelectedProductIndices: (indices) => set({ selectedProductIndices: indices }),
      toggleProductIndex: (index) =>
        set((s) => {
          const current = s.selectedProductIndices;
          return {
            selectedProductIndices: current.includes(index)
              ? current.filter((i) => i !== index)
              : [...current, index].sort((a, b) => a - b),
          };
        }),
      selectAllProducts: () =>
        set((s) => ({
          selectedProductIndices: s.csvProducts.map((_, i) => i),
        })),
      deselectAllProducts: () => set({ selectedProductIndices: [] }),

      // Step 3: Gender Avatars
      setAvatarImages: (gender, images) => {
        const key = `${gender}Avatar` as "maleAvatar" | "femaleAvatar" | "unisexAvatar";
        set((s) => ({ [key]: { ...s[key], images } }));
      },
      addAvatarImage: (gender, url) => {
        const key = `${gender}Avatar` as "maleAvatar" | "femaleAvatar" | "unisexAvatar";
        set((s) => ({ [key]: { ...s[key], images: [...s[key].images, url] } }));
      },
      removeAvatarImage: (gender, url) => {
        const key = `${gender}Avatar` as "maleAvatar" | "femaleAvatar" | "unisexAvatar";
        set((s) => ({
          [key]: { ...s[key], images: s[key].images.filter((u: string) => u !== url) },
        }));
      },
      setAvatarDNA: (gender, dna) => {
        const key = `${gender}Avatar` as "maleAvatar" | "femaleAvatar" | "unisexAvatar";
        set((s) => ({ [key]: { ...s[key], dna } }));
      },
      setAvatarExtracting: (gender, value) => {
        const key = `${gender}Avatar` as "maleAvatar" | "femaleAvatar" | "unisexAvatar";
        set((s) => ({ [key]: { ...s[key], isExtracting: value } }));
      },

      // Step 4: Inspiration
      setInspirationImages: (urls) => set({ inspirationImages: urls }),
      addInspirationImages: (urls) =>
        set((s) => ({
          inspirationImages: [...s.inspirationImages, ...urls],
        })),
      removeInspirationImage: (url) =>
        set((s) => ({
          inspirationImages: s.inspirationImages.filter((u) => u !== url),
        })),
      setInspirationDNA: (dna) => set({ inspirationDNA: dna }),
      setIsAnalyzingInspiration: (value) => set({ isAnalyzingInspiration: value }),

      // Step 5: Configuration
      setImagesPerProduct: (count) => set({ imagesPerProduct: count }),
      setAspectRatio: (ratio) => set({ aspectRatio: ratio }),

      // Step 6: Generation status
      setBatchJobId: (id) => set({ batchJobId: id }),
      setBatchStatus: (status) => set({ batchStatus: status }),
      setBatchProgress: (progress) => set({ batchProgress: progress }),
      setBatchMessage: (message) => set({ batchMessage: message }),
      setBatchPaused: (paused) => set({ batchPaused: paused }),
      setCurrentProductName: (name) => set({ currentProductName: name }),
      setCompletedCount: (count) => set({ completedCount: count }),
      setTotalProducts: (count) => set({ totalProducts: count }),

      // Step 7: Results
      setBatchResults: (results) => set({ batchResults: results }),
      updateBatchResult: (productIndex, result) =>
        set((s) => ({
          batchResults: s.batchResults.map((r) =>
            r.product_index === productIndex ? result : r
          ),
        })),

      // Legacy compat
      setPerfumeName: (name) => set({ perfumeName: name }),
      setBrandName: (name) => set({ brandName: name }),
      setInspiredBy: (value) => set({ inspiredBy: value }),
      setGender: (gender) => set({ gender }),
      setNotes: (notes) => set({ notes }),
      setIsGenerating: (value) => set({ isGenerating: value }),
      setIsFetchingNotes: (value) => set({ isFetchingNotes: value }),
      addRegeneratingStyle: (style) =>
        set((s) => ({
          regeneratingStyles: [...s.regeneratingStyles, style],
        })),
      removeRegeneratingStyle: (style) =>
        set((s) => ({
          regeneratingStyles: s.regeneratingStyles.filter((st) => st !== style),
        })),
      setGeneratedImages: (images) => set({ generatedImages: images }),
      setError: (error) => set({ error }),

      // Helpers
      getAllReferenceImages: () => {
        const state = get();
        const refs: string[] = [];
        if (state.bottleImage) refs.push(state.bottleImage);
        if (state.capImage) refs.push(state.capImage);
        refs.push(...state.labelImages);
        return refs;
      },

      getGenderAvatars: () => {
        const state = get();
        return {
          male: { images: state.maleAvatar.images, dna: state.maleAvatar.dna },
          female: { images: state.femaleAvatar.images, dna: state.femaleAvatar.dna },
          unisex: { images: state.unisexAvatar.images, dna: state.unisexAvatar.dna },
        };
      },

      clearBatch: () =>
        set({
          csvProducts: [],
          csvFileName: null,
          batchResults: [],
          batchJobId: null,
          batchStatus: "",
          batchProgress: 0,
          batchMessage: "",
          batchPaused: false,
          selectedProductIndices: [],
          currentProductName: "",
          completedCount: 0,
          totalProducts: 0,
        }),

      reset: () => set(initialState),
    }),
    {
      name: "perfume-studio-v2",
      partialize: (state) => ({
        // Persist across sessions
        currentStep: state.currentStep,
        bottleImage: state.bottleImage,
        capImage: state.capImage,
        labelImages: state.labelImages,
        productDNA: state.productDNA,
        maleAvatar: { images: state.maleAvatar.images, dna: state.maleAvatar.dna, isExtracting: false },
        femaleAvatar: { images: state.femaleAvatar.images, dna: state.femaleAvatar.dna, isExtracting: false },
        unisexAvatar: { images: state.unisexAvatar.images, dna: state.unisexAvatar.dna, isExtracting: false },
        inspirationImages: state.inspirationImages,
        imagesPerProduct: state.imagesPerProduct,
        aspectRatio: state.aspectRatio,
        // Don't persist: csvProducts, batchResults, batchJobId, batchStatus, inspirationDNA, etc.
      }),
    }
  )
);
