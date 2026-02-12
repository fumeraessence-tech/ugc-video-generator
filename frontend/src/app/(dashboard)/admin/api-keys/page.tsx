"use client";

import { useEffect, useState, useCallback } from "react";
import { Key, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PoolKey {
  id: string;
  service: string;
  status: string;
  last_used_at: string | null;
  error_count: number;
  created_at: string;
}

const SERVICE_LABELS: Record<string, string> = {
  google_ai: "Google AI",
  gcs: "Google Cloud Storage",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  rate_limited: "secondary",
  exhausted: "destructive",
  error: "destructive",
};

export default function AdminApiKeysPage() {
  const [keys, setKeys] = useState<PoolKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/api-keys");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setKeys(data.apiKeys);
    } catch {
      toast.error("Failed to load pool keys");
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
      const res = await fetch(`/api/admin/api-keys?id=${keyId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast.success("Pool key deleted");
    } catch {
      toast.error("Failed to delete pool key");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key className="size-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">API Key Pool</h1>
            <p className="text-sm text-muted-foreground">
              Shared API keys for the platform
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent>
          {keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Key className="mb-4 size-12 text-muted-foreground/50" />
              <p className="font-medium">No pool keys configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pool keys are managed directly in the Supabase dashboard.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="font-medium font-mono text-xs">
                      {key.id.slice(0, 8)}...
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {SERVICE_LABELS[key.service] ?? key.service}
                      </Badge>
                      <Badge variant={STATUS_VARIANT[key.status] ?? "secondary"}>
                        {key.status.replace("_", " ")}
                      </Badge>
                    </div>
                    {key.error_count > 0 && (
                      <span className="text-xs text-destructive">
                        {key.error_count} errors
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {key.last_used_at
                        ? `Used ${new Date(key.last_used_at).toLocaleDateString()}`
                        : "Never used"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(key.id)}
                      disabled={deletingId === key.id}
                      className="text-destructive hover:text-destructive"
                    >
                      {deletingId === key.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
