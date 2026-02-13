"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarCard, type AvatarData } from "@/components/avatars/avatar-card";
import { AvatarDetailDialog } from "@/components/avatars/avatar-detail-dialog";
import { CreateAvatarDialog } from "@/components/avatars/create-avatar-dialog";

/** Map snake_case Supabase row to camelCase AvatarData */
function mapAvatar(a: Record<string, unknown>): AvatarData {
  // If already camelCase (has thumbnailUrl), return as-is
  if ("thumbnailUrl" in a) return a as unknown as AvatarData;
  return {
    id: a.id as string,
    name: a.name as string,
    tag: (a.tag as string) ?? null,
    isSystem: (a.is_system as boolean) ?? false,
    thumbnailUrl: (a.thumbnail_url as string) ?? null,
    referenceSheet: (a.reference_sheet as string) ?? null,
    referenceImages: (a.reference_images as string[]) ?? [],
    dna: (a.dna as Record<string, unknown>) ?? {},
    userId: (a.user_id as string) ?? null,
    createdAt: a.created_at as string,
    updatedAt: a.updated_at as string,
  };
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<AvatarData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchAvatars = useCallback(async () => {
    try {
      const res = await fetch("/api/avatars");
      if (res.ok) {
        const data = await res.json();
        // Supabase returns snake_case columns — map to camelCase AvatarData
        setAvatars(data.map((a: Record<string, unknown>) => mapAvatar(a)));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvatars();
  }, [fetchAvatars]);

  const handleAvatarClick = (avatar: AvatarData) => {
    setSelectedAvatar(avatar);
    setDetailOpen(true);
  };

  const handleDelete = (avatarId: string) => {
    setAvatars((prev) => prev.filter((a) => a.id !== avatarId));
    // Close detail dialog if this avatar was selected
    if (selectedAvatar?.id === avatarId) {
      setDetailOpen(false);
      setSelectedAvatar(null);
    }
  };

  const handleUpdate = (updatedAvatar: AvatarData) => {
    const mapped = mapAvatar(updatedAvatar as unknown as Record<string, unknown>);
    setAvatars((prev) =>
      prev.map((a) => (a.id === mapped.id ? mapped : a))
    );
    setSelectedAvatar(mapped);
  };

  const handleReextract = (updatedAvatar: AvatarData) => {
    const mapped = mapAvatar(updatedAvatar as unknown as Record<string, unknown>);
    setAvatars((prev) =>
      prev.map((a) => (a.id === mapped.id ? mapped : a))
    );
  };

  const handleCreated = (avatar: AvatarData) => {
    setAvatars((prev) => [...prev, mapAvatar(avatar as unknown as Record<string, unknown>)]);
  };

  const systemAvatars = avatars.filter((a) => a.isSystem);
  const userAvatars = avatars.filter((a) => !a.isSystem);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-10">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Avatars</h1>
        <p className="text-muted-foreground mt-1">
          Choose from system avatars or create your own custom characters.
        </p>
      </div>

      {/* System Avatars Section */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">System Avatars</h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-0">
                  <Skeleton className="aspect-[3/4] w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : systemAvatars.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {systemAvatars.map((avatar) => (
              <AvatarCard
                key={avatar.id}
                avatar={avatar}
                onClick={() => handleAvatarClick(avatar)}
                onDelete={handleDelete}
                onReextract={handleReextract}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">
            No system avatars available.
          </p>
        )}
      </section>

      {/* User Avatars Section */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Your Avatars</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {/* Create New Avatar card */}
          <Card
            className="cursor-pointer overflow-hidden border-dashed transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/50"
            onClick={() => setCreateOpen(true)}
          >
            <CardContent className="p-0">
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <Plus className="size-6" />
                </div>
                <span className="text-xs font-medium">Create New</span>
              </div>
            </CardContent>
          </Card>

          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <CardContent className="p-0">
                    <Skeleton className="aspect-[3/4] w-full" />
                  </CardContent>
                </Card>
              ))
            : userAvatars.map((avatar) => (
                <AvatarCard
                  key={avatar.id}
                  avatar={avatar}
                  onClick={() => handleAvatarClick(avatar)}
                  onDelete={handleDelete}
                  onReextract={handleReextract}
                />
              ))}
        </div>
      </section>

      {/* Dialogs */}
      <AvatarDetailDialog
        avatar={selectedAvatar}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
      />

      <CreateAvatarDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
