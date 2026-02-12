"use client";

import { useEffect, useState, useCallback } from "react";
import { User, Check, Upload, Loader2, Plus, Volume2, Trash2, ImagePlus, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMassGeneratorStore } from "@/stores/mass-generator-store";
import {
  PLATFORM_LABELS,
  VIDEO_STYLE_LABELS,
  TONE_LABELS,
  type Platform,
  type VideoStyle,
  type Tone,
  type AvatarDNA,
} from "@/types/mass-generator";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Gemini TTS Voices
const GEMINI_VOICES = [
  { id: "Puck", name: "Puck", description: "Energetic, upbeat male voice", gender: "male" },
  { id: "Charon", name: "Charon", description: "Deep, authoritative male voice", gender: "male" },
  { id: "Kore", name: "Kore", description: "Warm, friendly female voice", gender: "female" },
  { id: "Fenrir", name: "Fenrir", description: "Strong, confident male voice", gender: "male" },
  { id: "Aoede", name: "Aoede", description: "Soft, melodic female voice", gender: "female" },
  { id: "Leda", name: "Leda", description: "Clear, professional female voice", gender: "female" },
  { id: "Orus", name: "Orus", description: "Calm, soothing male voice", gender: "male" },
  { id: "Zephyr", name: "Zephyr", description: "Light, youthful voice", gender: "neutral" },
];

// Unified avatar type for display
interface DisplayAvatar {
  id: string;
  name: string;
  tag?: string;
  thumbnailUrl?: string;
  referenceImages: string[];
  isSystem: boolean;
  dna: AvatarDNA | null;
  isLocal?: boolean; // For newly uploaded avatars not yet saved to DB
}

export function AvatarStep() {
  const {
    selectedAvatarId,
    setSelectedAvatarId,
    setAvatarDNA,
    setAvatarReferenceImages,
    platform,
    setPlatform,
    style,
    setStyle,
    tone,
    setTone,
    duration,
    setDuration,
    prevStep,
    nextStep,
  } = useMassGeneratorStore();

  const { toast } = useToast();
  const [allAvatars, setAllAvatars] = useState<DisplayAvatar[]>([]);
  const [loadingAvatars, setLoadingAvatars] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>("Kore");
  const [viewDNAAvatar, setViewDNAAvatar] = useState<DisplayAvatar | null>(null);
  const [deleteConfirmAvatar, setDeleteConfirmAvatar] = useState<DisplayAvatar | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch all avatars from database on mount
  const fetchAvatars = useCallback(async () => {
    try {
      const res = await fetch("/api/avatars");
      if (res.ok) {
        const avatars = await res.json();
        const mapped: DisplayAvatar[] = avatars.map((a: {
          id: string;
          name: string;
          tag?: string;
          thumbnailUrl?: string;
          referenceImages?: string[];
          isSystem: boolean;
          dna: Record<string, string>;
        }) => ({
          id: a.id,
          name: a.name,
          tag: a.tag,
          thumbnailUrl: a.thumbnailUrl,
          referenceImages: a.referenceImages || (a.thumbnailUrl ? [a.thumbnailUrl] : []),
          isSystem: a.isSystem,
          dna: a.dna ? {
            face: a.dna.face || "",
            skin: a.dna.skin || "",
            eyes: a.dna.eyes || "",
            hair: a.dna.hair || "",
            body: a.dna.body || "",
            voice: a.dna.voice || "",
            wardrobe: a.dna.wardrobe || "",
            prohibited_drift: a.dna.prohibited_drift || null,
            gender: a.dna.gender || "",
            ethnicity: a.dna.ethnicity || "",
            age_range: a.dna.age_range || "",
          } : null,
          isLocal: false,
        }));
        setAllAvatars(mapped);
      }
    } catch (error) {
      console.error("Failed to fetch avatars:", error);
    } finally {
      setLoadingAvatars(false);
    }
  }, []);

  useEffect(() => {
    fetchAvatars();
  }, [fetchAvatars]);

  // Handle file upload for new avatar
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file", variant: "destructive" });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("extract_dna", "true");

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/api/v1/avatars/upload-image`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Upload failed");
      }

      const data = await response.json();
      const imageUrl = data.image_url;
      const extractedDNA = data.dna;

      const newAvatar: DisplayAvatar = {
        id: `local-${Date.now()}`,
        name: `My Avatar ${allAvatars.filter(a => a.isLocal).length + 1}`,
        thumbnailUrl: imageUrl,
        referenceImages: [imageUrl],
        isSystem: false,
        isLocal: true,
        dna: extractedDNA ? {
          face: extractedDNA.face || "",
          skin: extractedDNA.skin || "",
          eyes: extractedDNA.eyes || "",
          hair: extractedDNA.hair || "",
          body: extractedDNA.body || "",
          voice: extractedDNA.voice || "",
          wardrobe: extractedDNA.wardrobe || "",
          prohibited_drift: extractedDNA.prohibited_drift || null,
          gender: extractedDNA.gender || "",
          ethnicity: extractedDNA.ethnicity || "",
          age_range: extractedDNA.age_range || "",
        } : null,
      };

      setAllAvatars(prev => [newAvatar, ...prev]);
      setSelectedAvatarId(newAvatar.id);

      toast({
        title: "Avatar created!",
        description: extractedDNA ? "DNA extracted successfully" : "Image uploaded",
      });

    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Could not upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [allAvatars, setSelectedAvatarId, toast]);

  // Handle adding reference image to existing avatar
  const handleAddReferenceImage = useCallback(async (avatarId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("extract_dna", "false");

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/api/v1/avatars/upload-image`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      const imageUrl = data.image_url;

      setAllAvatars(prev => prev.map(avatar => {
        if (avatar.id === avatarId) {
          return { ...avatar, referenceImages: [...avatar.referenceImages, imageUrl] };
        }
        return avatar;
      }));

      toast({ title: "Reference image added!" });

    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  // Delete avatar (works for both system and custom)
  const handleDeleteAvatar = useCallback(async (avatar: DisplayAvatar) => {
    setIsDeleting(true);

    try {
      // For local avatars, just remove from state
      if (avatar.isLocal) {
        setAllAvatars(prev => prev.filter(a => a.id !== avatar.id));
        if (selectedAvatarId === avatar.id) {
          setSelectedAvatarId("no-avatar");
        }
        toast({ title: "Avatar deleted" });
        setDeleteConfirmAvatar(null);
        return;
      }

      // For database avatars, call API
      const res = await fetch(`/api/avatars/${avatar.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Delete failed");
      }

      setAllAvatars(prev => prev.filter(a => a.id !== avatar.id));
      if (selectedAvatarId === avatar.id) {
        setSelectedAvatarId("no-avatar");
      }
      toast({ title: "Avatar deleted" });
      setDeleteConfirmAvatar(null);

    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not delete avatar",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [selectedAvatarId, setSelectedAvatarId, toast]);

  // Update avatar DNA and reference images when selection changes
  useEffect(() => {
    if (!selectedAvatarId || selectedAvatarId === "no-avatar") {
      setAvatarDNA(null);
      setAvatarReferenceImages([]);
      return;
    }

    const avatar = allAvatars.find((a) => a.id === selectedAvatarId);
    if (avatar) {
      if (avatar.dna) {
        setAvatarDNA(avatar.dna);
      } else {
        setAvatarDNA(null);
      }
      setAvatarReferenceImages(avatar.referenceImages);
    }
  }, [selectedAvatarId, allAvatars, setAvatarDNA, setAvatarReferenceImages]);

  // Separate system and custom avatars for display
  const systemAvatars = allAvatars.filter(a => a.isSystem);
  const customAvatars = allAvatars.filter(a => !a.isSystem);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Avatar & Style</h2>
        <p className="text-muted-foreground">
          Upload your avatar or select from available options. DNA is automatically extracted from uploaded images.
        </p>
      </div>

      {/* Upload New Avatar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="size-5" />
            Upload Your Avatar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <label
            className={cn(
              "flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-all",
              isUploading
                ? "border-primary bg-primary/10 cursor-wait"
                : "border-muted-foreground/25 hover:border-primary hover:bg-muted/50"
            )}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
              disabled={isUploading}
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="size-10 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Uploading & extracting DNA...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="p-3 rounded-full bg-muted">
                  <ImagePlus className="size-8 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium">Click to upload avatar image</span>
                <span className="text-xs text-muted-foreground">PNG, JPG up to 10MB</span>
              </div>
            )}
          </label>
        </CardContent>
      </Card>

      {/* Available Avatars - Combined Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Available Avatars ({allAvatars.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAvatars ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : allAvatars.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No avatars available. Upload one above!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Custom Avatars first */}
              {customAvatars.map((avatar) => (
                <AvatarCard
                  key={avatar.id}
                  avatar={avatar}
                  isSelected={selectedAvatarId === avatar.id}
                  onSelect={() => setSelectedAvatarId(avatar.id)}
                  onViewDNA={() => setViewDNAAvatar(avatar)}
                  onAddRef={(files) => handleAddReferenceImage(avatar.id, files)}
                  onDelete={() => setDeleteConfirmAvatar(avatar)}
                  isUploading={isUploading}
                />
              ))}
              {/* System Avatars */}
              {systemAvatars.map((avatar) => (
                <AvatarCard
                  key={avatar.id}
                  avatar={avatar}
                  isSelected={selectedAvatarId === avatar.id}
                  onSelect={() => setSelectedAvatarId(avatar.id)}
                  onViewDNA={() => setViewDNAAvatar(avatar)}
                  onAddRef={(files) => handleAddReferenceImage(avatar.id, files)}
                  onDelete={() => setDeleteConfirmAvatar(avatar)}
                  isUploading={isUploading}
                />
              ))}
              {/* No Avatar Option */}
              <div
                onClick={() => setSelectedAvatarId("no-avatar")}
                className={cn(
                  "relative flex gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer min-h-[120px]",
                  selectedAvatarId === "no-avatar"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <User className="size-10 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="font-medium">No Avatar</p>
                  <p className="text-xs text-muted-foreground mt-1">Product-only video</p>
                </div>
                {selectedAvatarId === "no-avatar" && (
                  <div className="absolute top-2 right-2 bg-primary rounded-full p-0.5">
                    <Check className="size-3 text-primary-foreground" />
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Video Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Video Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PLATFORM_LABELS) as [Platform, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Video Style</Label>
              <Select value={style} onValueChange={(v) => setStyle(v as VideoStyle)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(VIDEO_STYLE_LABELS) as [VideoStyle, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(TONE_LABELS) as [Tone, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Duration</Label>
              <span className="text-sm font-medium">{duration}s</span>
            </div>
            <Slider
              value={[duration]}
              onValueChange={(values: number[]) => setDuration(values[0])}
              min={15}
              max={60}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>15s</span>
              <span>30s</span>
              <span>45s</span>
              <span>60s</span>
            </div>
          </div>

          {/* Voice */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Volume2 className="size-4" />
              Voice
            </Label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GEMINI_VOICES.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    <div className="flex items-center gap-2">
                      <span>{voice.name}</span>
                      <span className="text-xs text-muted-foreground">- {voice.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>
          Back
        </Button>
        <Button onClick={nextStep} size="lg">
          Next: Create Brief
        </Button>
      </div>

      {/* DNA View Dialog */}
      <Dialog open={!!viewDNAAvatar} onOpenChange={(open) => !open && setViewDNAAvatar(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Avatar DNA - {viewDNAAvatar?.name}</DialogTitle>
            <DialogDescription>
              Visual characteristics for AI image generation consistency
            </DialogDescription>
          </DialogHeader>
          {viewDNAAvatar?.dna && (
            <div className="space-y-3 mt-2">
              {Object.entries(viewDNAAvatar.dna).map(([key, value]) => (
                value && (
                  <div key={key} className="flex gap-2">
                    <span className="text-sm font-medium capitalize min-w-[100px]">{key.replace(/_/g, ' ')}:</span>
                    <span className="text-sm text-muted-foreground">{String(value)}</span>
                  </div>
                )
              ))}
            </div>
          )}
          {viewDNAAvatar?.referenceImages && viewDNAAvatar.referenceImages.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">Reference Images ({viewDNAAvatar.referenceImages.length})</p>
              <div className="flex gap-2 flex-wrap">
                {viewDNAAvatar.referenceImages.map((img: string, i: number) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={img} alt={`Ref ${i + 1}`} className="w-16 h-16 rounded object-cover" />
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmAvatar} onOpenChange={(open) => !open && setDeleteConfirmAvatar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Avatar</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteConfirmAvatar?.name}&quot;?
              {deleteConfirmAvatar?.isSystem && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  This is a system avatar. Deleting it will remove it for all users.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmAvatar && handleDeleteAvatar(deleteConfirmAvatar)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Avatar Card Component - Rectangular layout
function AvatarCard({
  avatar,
  isSelected,
  onSelect,
  onViewDNA,
  onAddRef,
  onDelete,
  isUploading,
}: {
  avatar: DisplayAvatar;
  isSelected: boolean;
  onSelect: () => void;
  onViewDNA: () => void;
  onAddRef: (files: FileList | null) => void;
  onDelete: () => void;
  isUploading: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "relative flex gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50"
      )}
    >
      {/* Avatar Image - Rectangular */}
      <div className="relative shrink-0">
        {avatar.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar.thumbnailUrl}
            alt={avatar.name}
            className="w-24 h-24 rounded-lg object-cover"
          />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center">
            <User className="size-10 text-muted-foreground" />
          </div>
        )}
        {isSelected && (
          <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5">
            <Check className="size-3 text-primary-foreground" />
          </div>
        )}
      </div>

      {/* Avatar Info */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium truncate">{avatar.name}</p>
            {avatar.tag && (
              <p className="text-xs text-muted-foreground truncate">{avatar.tag}</p>
            )}
          </div>
          {avatar.isSystem && (
            <Badge variant="secondary" className="text-[10px] shrink-0">System</Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-1">
          {avatar.referenceImages.length} ref image{avatar.referenceImages.length !== 1 ? 's' : ''}
        </p>
        {avatar.dna && (
          <p className="text-xs text-green-600 dark:text-green-400">DNA available</p>
        )}

        {/* Action Buttons */}
        <div className="flex gap-1 mt-auto pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onViewDNA();
            }}
          >
            <Eye className="size-3 mr-1" />
            DNA
          </Button>
          <label className="inline-flex" onClick={(e) => e.stopPropagation()}>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onAddRef(e.target.files)}
              disabled={isUploading}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              asChild
            >
              <span>
                <Plus className="size-3 mr-1" />
                Ref
              </span>
            </Button>
          </label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
