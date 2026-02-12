"use client";

import { useState } from "react";
import { Loader2, ScanEye, UserCircle, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { usePerfumeStudioStore } from "@/stores/perfume-studio-store";
import { DNADisplay } from "../shared/dna-display";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Gender = "male" | "female" | "unisex";

const AVATAR_SECTIONS: { gender: Gender; label: string; color: string; dnaColor: "blue" | "pink" | "violet" }[] = [
  { gender: "male", label: "Male Avatar", color: "border-blue-500/30 bg-blue-500/5", dnaColor: "blue" },
  { gender: "female", label: "Female Avatar", color: "border-pink-500/30 bg-pink-500/5", dnaColor: "pink" },
  { gender: "unisex", label: "Unisex Avatar", color: "border-violet-500/30 bg-violet-500/5", dnaColor: "violet" },
];

export function StepAvatars() {
  const store = usePerfumeStudioStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState<Gender | null>(null);

  const getSlot = (gender: Gender) => {
    if (gender === "male") return store.maleAvatar;
    if (gender === "female") return store.femaleAvatar;
    return store.unisexAvatar;
  };

  const uploadAvatarImages = async (files: File[], gender: Gender) => {
    setUploading(gender);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/upload-avatars`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.urls?.length) {
        data.urls.forEach((url: string) => store.addAvatarImage(gender, url));
        toast({ title: `${data.urls.length} ${gender} avatar image(s) uploaded` });
      }
    } catch (e) {
      toast({ title: "Upload failed", description: String(e), variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const extractDNA = async (gender: Gender) => {
    const slot = getSlot(gender);
    if (slot.images.length === 0) {
      toast({ title: "No images", description: `Upload ${gender} avatar images first`, variant: "destructive" });
      return;
    }
    store.setAvatarExtracting(gender, true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/extract-gender-avatar-dna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_urls: slot.images, gender }),
      });
      const data = await res.json();
      if (data.success) {
        store.setAvatarDNA(gender, data.avatar_dna);
        toast({ title: `${gender} avatar DNA extracted` });
      }
    } catch (e) {
      toast({ title: "DNA extraction failed", description: String(e), variant: "destructive" });
    } finally {
      store.setAvatarExtracting(gender, false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload avatar reference images for each gender. These models will appear in lifestyle shots.
        Male avatars for male products, female for female, unisex as fallback.
      </p>
      {AVATAR_SECTIONS.map(({ gender, label, color, dnaColor }) => {
        const slot = getSlot(gender);
        return (
          <Card key={gender} className={color}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserCircle className="size-4" />
                  {label}
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => extractDNA(gender)}
                  disabled={slot.images.length === 0 || slot.isExtracting}
                >
                  {slot.isExtracting ? (
                    <><Loader2 className="size-3 animate-spin mr-1.5" />Extracting...</>
                  ) : (
                    <><ScanEye className="size-3 mr-1.5" />Extract DNA</>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {slot.images.map((url) => (
                  <div key={url} className="relative group size-16 rounded-lg overflow-hidden border">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => store.removeAvatarImage(gender, url)}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                ))}
                <label className="flex items-center justify-center size-16 rounded-lg border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors">
                  {uploading === gender ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4 text-muted-foreground" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length) uploadAvatarImages(files, gender);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {slot.dna && <DNADisplay title={`${label} DNA`} data={slot.dna} color={dnaColor} />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
