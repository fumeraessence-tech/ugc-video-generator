/**
 * Bulk Image Generator Store
 *
 * Zustand store for the CSV-driven bulk product image generation pipeline:
 * 1. Upload reference images (Fumera bottle)
 * 2. Upload CSV (PRODUCT_NAME, LIQUID_COLOR)
 * 3. Review & configure
 * 4. Generate (SSE streaming progress)
 * 5. Gallery (view all results, download ZIP)
 */

import { create } from "zustand";

// ─── Types ───────────────────────────────────────────────────────

export interface CsvRow {
  PRODUCT_NAME: string;
  LIQUID_COLOR?: string;
  [key: string]: string | undefined;
}

export interface BulkGeneratedImage {
  id: string;
  productName: string;
  rowIndex: number;
  angle: string; // "base" | "front_hero" | "three_quarter_left" | "three_quarter_right" | "low_angle"
  label: string;
  imageUrl: string;
  status: "pending" | "generating" | "done" | "error";
  error?: string;
}

export type BulkStep = "reference" | "csv" | "review" | "generate" | "gallery";

export const BULK_STEPS: { key: BulkStep; label: string; number: number }[] = [
  { key: "reference", label: "Reference", number: 1 },
  { key: "csv", label: "CSV Upload", number: 2 },
  { key: "review", label: "Review", number: 3 },
  { key: "generate", label: "Generate", number: 4 },
  { key: "gallery", label: "Gallery", number: 5 },
];

// ─── Store Interface ─────────────────────────────────────────────

interface BulkGeneratorStore {
  // Navigation
  currentStep: BulkStep;
  setCurrentStep: (step: BulkStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Step 1: Reference Images
  referenceImages: string[];
  boxImages: string[];
  pinterestImages: Record<string, string[]>;
  setReferenceImages: (images: string[]) => void;
  addReferenceImages: (urls: string[]) => void;
  removeReferenceImage: (url: string) => void;
  setBoxImages: (images: string[]) => void;
  addBoxImages: (urls: string[]) => void;
  removeBoxImage: (url: string) => void;
  addPinterestImages: (rowIndex: number, urls: string[]) => void;
  removePinterestImage: (rowIndex: number, url: string) => void;
  clearPinterestImages: (rowIndex: number) => void;
  avatarImages: Record<string, string[]>;
  addAvatarImages: (rowIndex: number, urls: string[]) => void;
  removeAvatarImage: (rowIndex: number, url: string) => void;
  clearAvatarImages: (rowIndex: number) => void;

  // Step 2: CSV
  csvRows: CsvRow[];
  csvColumns: string[];
  csvFileName: string;
  setCsvData: (rows: CsvRow[], columns: string[], fileName: string) => void;
  removeCsvRow: (index: number) => void;
  removeCsvRows: (indices: Set<number>) => void;
  clearCsv: () => void;

  // Step 3: Config
  brandName: string;
  setBrandName: (name: string) => void;

  // Step 4 & 5: Generated Images
  generatedImages: BulkGeneratedImage[];
  isGenerating: boolean;
  currentRowIndex: number;
  totalRows: number;
  error: string | null;
  setGeneratedImages: (images: BulkGeneratedImage[]) => void;
  addGeneratedImage: (image: BulkGeneratedImage) => void;
  updateGeneratedImage: (id: string, updates: Partial<BulkGeneratedImage>) => void;
  setIsGenerating: (generating: boolean) => void;
  setCurrentRowIndex: (index: number) => void;
  setTotalRows: (total: number) => void;
  setError: (error: string | null) => void;

  // Helpers
  reset: () => void;
}

// ─── Initial State ───────────────────────────────────────────────

const initialState = {
  currentStep: "reference" as BulkStep,
  referenceImages: [] as string[],
  boxImages: [] as string[],
  pinterestImages: {} as Record<string, string[]>,
  avatarImages: {} as Record<string, string[]>,
  csvRows: [] as CsvRow[],
  csvColumns: [] as string[],
  csvFileName: "",
  brandName: "Fumera",
  generatedImages: [] as BulkGeneratedImage[],
  isGenerating: false,
  currentRowIndex: 0,
  totalRows: 0,
  error: null as string | null,
};

// ─── Store ───────────────────────────────────────────────────────

export const useBulkGeneratorStore = create<BulkGeneratorStore>()((set, get) => ({
  ...initialState,

  // Navigation
  setCurrentStep: (step) => set({ currentStep: step }),
  nextStep: () => {
    const steps = BULK_STEPS.map((s) => s.key);
    const idx = steps.indexOf(get().currentStep);
    if (idx < steps.length - 1) set({ currentStep: steps[idx + 1] });
  },
  prevStep: () => {
    const steps = BULK_STEPS.map((s) => s.key);
    const idx = steps.indexOf(get().currentStep);
    if (idx > 0) set({ currentStep: steps[idx - 1] });
  },

  // Step 1: Reference Images
  setReferenceImages: (images) => set({ referenceImages: images }),
  addReferenceImages: (urls) =>
    set((s) => ({ referenceImages: [...s.referenceImages, ...urls] })),
  removeReferenceImage: (url) =>
    set((s) => ({ referenceImages: s.referenceImages.filter((u) => u !== url) })),
  setBoxImages: (images) => set({ boxImages: images }),
  addBoxImages: (urls) =>
    set((s) => ({ boxImages: [...s.boxImages, ...urls] })),
  removeBoxImage: (url) =>
    set((s) => ({ boxImages: s.boxImages.filter((u) => u !== url) })),
  addPinterestImages: (rowIndex, urls) =>
    set((s) => {
      const key = String(rowIndex);
      const existing = s.pinterestImages[key] ?? [];
      return { pinterestImages: { ...s.pinterestImages, [key]: [...existing, ...urls] } };
    }),
  removePinterestImage: (rowIndex, url) =>
    set((s) => {
      const key = String(rowIndex);
      const existing = s.pinterestImages[key] ?? [];
      return { pinterestImages: { ...s.pinterestImages, [key]: existing.filter((u) => u !== url) } };
    }),
  clearPinterestImages: (rowIndex) =>
    set((s) => {
      const key = String(rowIndex);
      const { [key]: _, ...rest } = s.pinterestImages;
      return { pinterestImages: rest };
    }),
  addAvatarImages: (rowIndex, urls) =>
    set((s) => {
      const key = String(rowIndex);
      const existing = s.avatarImages[key] ?? [];
      return { avatarImages: { ...s.avatarImages, [key]: [...existing, ...urls] } };
    }),
  removeAvatarImage: (rowIndex, url) =>
    set((s) => {
      const key = String(rowIndex);
      const existing = s.avatarImages[key] ?? [];
      return { avatarImages: { ...s.avatarImages, [key]: existing.filter((u) => u !== url) } };
    }),
  clearAvatarImages: (rowIndex) =>
    set((s) => {
      const key = String(rowIndex);
      const { [key]: _, ...rest } = s.avatarImages;
      return { avatarImages: rest };
    }),

  // Step 2: CSV
  setCsvData: (rows, columns, fileName) =>
    set({ csvRows: rows, csvColumns: columns, csvFileName: fileName }),
  removeCsvRow: (index) =>
    set((s) => ({ csvRows: s.csvRows.filter((_, i) => i !== index) })),
  removeCsvRows: (indices) =>
    set((s) => ({ csvRows: s.csvRows.filter((_, i) => !indices.has(i)) })),
  clearCsv: () => set({ csvRows: [], csvColumns: [], csvFileName: "" }),

  // Step 3: Config
  setBrandName: (name) => set({ brandName: name }),

  // Step 4 & 5: Generated Images
  setGeneratedImages: (images) => set({ generatedImages: images }),
  addGeneratedImage: (image) =>
    set((s) => ({ generatedImages: [...s.generatedImages, image] })),
  updateGeneratedImage: (id, updates) =>
    set((s) => ({
      generatedImages: s.generatedImages.map((img) =>
        img.id === id ? { ...img, ...updates } : img
      ),
    })),
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  setCurrentRowIndex: (index) => set({ currentRowIndex: index }),
  setTotalRows: (total) => set({ totalRows: total }),
  setError: (error) => set({ error }),

  // Helpers
  reset: () => set(initialState),
}));
