"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/use-auth";
import {
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Settings,
  User,
  Palette,
  Sun,
  Moon,
  Monitor,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { toast } from "sonner";

// ---------- Types ----------

interface ApiKeyItem {
  id: string;
  label: string;
  service: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: string;
}

// ---------- Constants ----------

const SERVICE_LABELS: Record<string, string> = {
  google_ai: "Google AI",
  gcs: "Google Cloud Storage",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  rate_limited: "secondary",
  exhausted: "destructive",
  error: "destructive",
};

// ---------- Main Page ----------

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl p-6 md:p-8">
      <div className="mb-8 flex items-center gap-3">
        <Settings className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account, API keys, and preferences.
          </p>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6 w-full sm:w-auto">
          <TabsTrigger value="profile">
            <User className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="api-keys">
            <Key className="size-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="size-4" />
            Appearance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Profile Tab ----------

function ProfileTab() {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/settings/profile");
        if (!res.ok) throw new Error("Failed to fetch profile");
        const data = await res.json();
        setProfile(data.user);
        setName(data.user.name ?? "");
        setImage(data.user.image ?? "");
      } catch {
        toast.error("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          image: image || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      const data = await res.json();
      setProfile(data.user);
      toast.success("Profile updated successfully");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  const initials = (profile?.name ?? profile?.email ?? "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Update your personal information.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={profile?.image ?? undefined} alt={profile?.name ?? "Avatar"} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{profile?.name ?? "No name set"}</p>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="profile-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="profile-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="profile-email"
              value={profile?.email ?? ""}
              disabled
              readOnly
              className="opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="profile-image" className="text-sm font-medium">
              Avatar URL
            </label>
            <Input
              id="profile-image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              type="url"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- API Keys Tab ----------

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/api-keys");
      if (!res.ok) throw new Error("Failed to fetch keys");
      const data = await res.json();
      setKeys(data.apiKeys);
    } catch {
      toast.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function handleDelete(keyId: string) {
    setDeletingId(keyId);
    try {
      const res = await fetch(`/api/settings/api-keys/${keyId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete key");
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast.success("API key deleted");
    } catch {
      toast.error("Failed to delete API key");
    } finally {
      setDeletingId(null);
    }
  }

  function handleKeyAdded(newKey: ApiKeyItem) {
    setKeys((prev) => [newKey, ...prev]);
    setDialogOpen(false);
    toast.success("API key added successfully");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Add your Google AI API key to power all generation services.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                Add API Key
              </Button>
            </DialogTrigger>
            <AddKeyDialog
              onSuccess={handleKeyAdded}
              onClose={() => setDialogOpen(false)}
            />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-8 w-8" />
              </div>
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="mb-4 size-12 text-muted-foreground/50" />
            <p className="font-medium">No API key configured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your Google AI API key to start generating videos.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="font-medium">{key.label}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {SERVICE_LABELS[key.service] ?? key.service}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[key.status] ?? "secondary"}>
                      {key.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {key.lastUsedAt
                      ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                      : "Never used"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDelete(key.id)}
                    disabled={deletingId === key.id}
                    className="text-destructive hover:text-destructive"
                  >
                    {deletingId === key.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Add Key Dialog ----------

function AddKeyDialog({
  onSuccess,
  onClose,
}: {
  onSuccess: (key: ApiKeyItem) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [service, setService] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label || !service || !apiKey) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, service, key: apiKey }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to add key");
      }
      const data = await res.json();
      onSuccess(data.apiKey);
      setLabel("");
      setService("");
      setApiKey("");
      setShowKey(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add API key"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add API Key</DialogTitle>
        <DialogDescription>
          One Google AI API key powers everything — Gemini, Veo, Nano Banana, and TTS.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="key-label" className="text-sm font-medium">
            Label
          </label>
          <Input
            id="key-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. My Gemini Key"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="key-service" className="text-sm font-medium">
            Service
          </label>
          <Select value={service} onValueChange={setService}>
            <SelectTrigger className="w-full" id="key-service">
              <SelectValue placeholder="Select a service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="google_ai">Google AI (Gemini, Veo, TTS — all-in-one)</SelectItem>
              <SelectItem value="gcs">Google Cloud Storage</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            One Google AI key powers everything: script generation, storyboards, video, and TTS.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="key-value" className="text-sm font-medium">
            API Key
          </label>
          <div className="relative">
            <Input
              id="key-value"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              className="pr-10"
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? (
                <EyeOff className="size-3" />
              ) : (
                <Eye className="size-3" />
              )}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !label || !service || !apiKey}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Add Key
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ---------- Appearance Tab ----------

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const themes = [
    {
      value: "light" as const,
      label: "Light",
      icon: Sun,
      description: "Clean and bright interface",
      bgClass: "bg-white border-gray-200",
      fgClass: "bg-gray-200",
      accentClass: "bg-gray-300",
    },
    {
      value: "dark" as const,
      label: "Dark",
      icon: Moon,
      description: "Easy on the eyes in low light",
      bgClass: "bg-gray-900 border-gray-700",
      fgClass: "bg-gray-700",
      accentClass: "bg-gray-600",
    },
    {
      value: "system" as const,
      label: "System",
      icon: Monitor,
      description: "Follow your OS preference",
      bgClass: "bg-gray-500 border-gray-400",
      fgClass: "bg-gray-400",
      accentClass: "bg-gray-500",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Customize the look and feel of the application.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {themes.map((t) => {
            const isActive = mounted && theme === t.value;
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTheme(t.value)}
                className={`group relative flex flex-col items-center gap-3 rounded-lg border-2 p-4 transition-all hover:border-primary/50 ${
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                {/* Preview card */}
                <div
                  className={`flex h-24 w-full flex-col gap-2 rounded-md border p-3 ${t.bgClass}`}
                >
                  <div className={`h-2 w-3/4 rounded ${t.fgClass}`} />
                  <div className={`h-2 w-1/2 rounded ${t.fgClass}`} />
                  <div className="mt-auto flex gap-1.5">
                    <div className={`h-2 w-8 rounded ${t.accentClass}`} />
                    <div className={`h-2 w-6 rounded ${t.accentClass}`} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <span className="text-sm font-medium">{t.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.description}
                </p>

                {isActive && (
                  <Badge className="absolute -top-2 -right-2" variant="default">
                    Active
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
