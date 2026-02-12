/**
 * Product Studio Store
 *
 * Zustand store for the 4-step product image generation pipeline:
 * 1. Upload (CSV + bottle images)
 * 2. White BG (generate ecommerce images)
 * 3. Inspiration (styled generation)
 * 4. Review (results + downloads)
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ───────────────────────────────────────────────────────

export interface CSVProduct {
  perfume_name: string;
  cleaned_name: string;
  brand_name: string;
  gender: string;
  description: string;
  handle: string;
  image_src: string;
  row_number: number;
}

export interface WhiteBgResult {
  product_index: number;
  perfume_name: string;
  status: "success" | "error";
  image_url: string;
  error?: string;
}

export interface StyledImage {
  style: string;
  label: string;
  image_url: string;
}

export interface InspirationResult {
  product_index: number;
  perfume_name: string;
  status: "success" | "error";
  images: StyledImage[];
  count: number;
}

export type StudioStep = "upload" | "white-bg" | "inspiration" | "review";

export const STUDIO_STEPS: { key: StudioStep; label: string; number: number }[] = [
  { key: "upload", label: "Upload", number: 1 },
  { key: "white-bg", label: "White BG", number: 2 },
  { key: "inspiration", label: "Styled", number: 3 },
  { key: "review", label: "Review", number: 4 },
];

// ─── Store Interface ─────────────────────────────────────────────

interface ProductStudioStore {
  // Navigation
  currentStep: StudioStep;
  setCurrentStep: (step: StudioStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Step 1: Upload
  csvProducts: CSVProduct[];
  csvFileName: string | null;
  selectedProductIndices: number[];
  bottleImages: Record<number, string>; // product_index -> image url
  setCsvProducts: (products: CSVProduct[]) => void;
  setCsvFileName: (name: string | null) => void;
  setSelectedProductIndices: (indices: number[]) => void;
  toggleProductIndex: (index: number) => void;
  selectAllProducts: () => void;
  deselectAllProducts: () => void;
  setBottleImage: (productIndex: number, url: string) => void;
  removeBottleImage: (productIndex: number) => void;

  // Step 2: White BG generation
  whiteBgJobId: string | null;
  whiteBgStatus: string;
  whiteBgProgress: number;
  whiteBgMessage: string;
  whiteBgPaused: boolean;
  whiteBgCurrentProduct: string;
  whiteBgCompletedCount: number;
  whiteBgTotalProducts: number;
  whiteBgResults: WhiteBgResult[];
  setWhiteBgJobId: (id: string | null) => void;
  setWhiteBgStatus: (status: string) => void;
  setWhiteBgProgress: (progress: number) => void;
  setWhiteBgMessage: (message: string) => void;
  setWhiteBgPaused: (paused: boolean) => void;
  setWhiteBgCurrentProduct: (name: string) => void;
  setWhiteBgCompletedCount: (count: number) => void;
  setWhiteBgTotalProducts: (count: number) => void;
  setWhiteBgResults: (results: WhiteBgResult[]) => void;

  // Step 3: Inspiration
  inspirationImages: string[];
  inspirationJobId: string | null;
  inspirationStatus: string;
  inspirationProgress: number;
  inspirationMessage: string;
  inspirationPaused: boolean;
  inspirationCurrentProduct: string;
  inspirationCompletedCount: number;
  inspirationTotalProducts: number;
  inspirationResults: InspirationResult[];
  addInspirationImages: (urls: string[]) => void;
  removeInspirationImage: (url: string) => void;
  setInspirationImages: (urls: string[]) => void;
  setInspirationJobId: (id: string | null) => void;
  setInspirationStatus: (status: string) => void;
  setInspirationProgress: (progress: number) => void;
  setInspirationMessage: (message: string) => void;
  setInspirationPaused: (paused: boolean) => void;
  setInspirationCurrentProduct: (name: string) => void;
  setInspirationCompletedCount: (count: number) => void;
  setInspirationTotalProducts: (count: number) => void;
  setInspirationResults: (results: InspirationResult[]) => void;

  // Helpers
  getWhiteBgImageMap: () => Record<number, string>;
  reset: () => void;
}

// ─── Initial State ───────────────────────────────────────────────

const initialState = {
  currentStep: "upload" as StudioStep,

  // Step 1
  csvProducts: [] as CSVProduct[],
  csvFileName: null as string | null,
  selectedProductIndices: [] as number[],
  bottleImages: {} as Record<number, string>,

  // Step 2
  whiteBgJobId: null as string | null,
  whiteBgStatus: "",
  whiteBgProgress: 0,
  whiteBgMessage: "",
  whiteBgPaused: false,
  whiteBgCurrentProduct: "",
  whiteBgCompletedCount: 0,
  whiteBgTotalProducts: 0,
  whiteBgResults: [] as WhiteBgResult[],

  // Step 3
  inspirationImages: [] as string[],
  inspirationJobId: null as string | null,
  inspirationStatus: "",
  inspirationProgress: 0,
  inspirationMessage: "",
  inspirationPaused: false,
  inspirationCurrentProduct: "",
  inspirationCompletedCount: 0,
  inspirationTotalProducts: 0,
  inspirationResults: [] as InspirationResult[],
};

// ─── Store ───────────────────────────────────────────────────────

export const useProductStudioStore = create<ProductStudioStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Navigation
      setCurrentStep: (step) => set({ currentStep: step }),
      nextStep: () => {
        const steps = STUDIO_STEPS.map((s) => s.key);
        const idx = steps.indexOf(get().currentStep);
        if (idx < steps.length - 1) set({ currentStep: steps[idx + 1] });
      },
      prevStep: () => {
        const steps = STUDIO_STEPS.map((s) => s.key);
        const idx = steps.indexOf(get().currentStep);
        if (idx > 0) set({ currentStep: steps[idx - 1] });
      },

      // Step 1: Upload
      setCsvProducts: (products) => set({ csvProducts: products }),
      setCsvFileName: (name) => set({ csvFileName: name }),
      setSelectedProductIndices: (indices) => set({ selectedProductIndices: indices }),
      toggleProductIndex: (index) =>
        set((s) => ({
          selectedProductIndices: s.selectedProductIndices.includes(index)
            ? s.selectedProductIndices.filter((i) => i !== index)
            : [...s.selectedProductIndices, index].sort((a, b) => a - b),
        })),
      selectAllProducts: () =>
        set((s) => ({ selectedProductIndices: s.csvProducts.map((_, i) => i) })),
      deselectAllProducts: () => set({ selectedProductIndices: [] }),
      setBottleImage: (productIndex, url) =>
        set((s) => ({ bottleImages: { ...s.bottleImages, [productIndex]: url } })),
      removeBottleImage: (productIndex) =>
        set((s) => {
          const next = { ...s.bottleImages };
          delete next[productIndex];
          return { bottleImages: next };
        }),

      // Step 2: White BG
      setWhiteBgJobId: (id) => set({ whiteBgJobId: id }),
      setWhiteBgStatus: (status) => set({ whiteBgStatus: status }),
      setWhiteBgProgress: (progress) => set({ whiteBgProgress: progress }),
      setWhiteBgMessage: (message) => set({ whiteBgMessage: message }),
      setWhiteBgPaused: (paused) => set({ whiteBgPaused: paused }),
      setWhiteBgCurrentProduct: (name) => set({ whiteBgCurrentProduct: name }),
      setWhiteBgCompletedCount: (count) => set({ whiteBgCompletedCount: count }),
      setWhiteBgTotalProducts: (count) => set({ whiteBgTotalProducts: count }),
      setWhiteBgResults: (results) => set({ whiteBgResults: results }),

      // Step 3: Inspiration
      addInspirationImages: (urls) =>
        set((s) => ({ inspirationImages: [...s.inspirationImages, ...urls] })),
      removeInspirationImage: (url) =>
        set((s) => ({ inspirationImages: s.inspirationImages.filter((u) => u !== url) })),
      setInspirationImages: (urls) => set({ inspirationImages: urls }),
      setInspirationJobId: (id) => set({ inspirationJobId: id }),
      setInspirationStatus: (status) => set({ inspirationStatus: status }),
      setInspirationProgress: (progress) => set({ inspirationProgress: progress }),
      setInspirationMessage: (message) => set({ inspirationMessage: message }),
      setInspirationPaused: (paused) => set({ inspirationPaused: paused }),
      setInspirationCurrentProduct: (name) => set({ inspirationCurrentProduct: name }),
      setInspirationCompletedCount: (count) => set({ inspirationCompletedCount: count }),
      setInspirationTotalProducts: (count) => set({ inspirationTotalProducts: count }),
      setInspirationResults: (results) => set({ inspirationResults: results }),

      // Helpers
      getWhiteBgImageMap: () => {
        const results = get().whiteBgResults;
        const map: Record<number, string> = {};
        for (const r of results) {
          if (r.status === "success" && r.image_url) {
            map[r.product_index] = r.image_url;
          }
        }
        return map;
      },

      reset: () => set(initialState),
    }),
    {
      name: "product-studio-v1",
      partialize: (state) => ({
        currentStep: state.currentStep,
        csvProducts: state.csvProducts,
        csvFileName: state.csvFileName,
        selectedProductIndices: state.selectedProductIndices,
        bottleImages: state.bottleImages,
        whiteBgResults: state.whiteBgResults,
        inspirationImages: state.inspirationImages,
        inspirationResults: state.inspirationResults,
      }),
    }
  )
);
