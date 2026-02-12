"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, FileText, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface Script {
  id: string;
  title: string;
  sceneCount: number;
  scenes: Array<{
    scene_number: string;
    dialogue?: string;
    scene_type?: string;
    action?: string;
    prompt?: string;
  }>;
  createdAt: string;
  productName: string | null;
}

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchScripts() {
      try {
        const res = await fetch("/api/library?limit=50");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        // Extract scripts from jobs
        const extracted: Script[] = data.jobs
          .filter((job: { script: unknown }) => job.script !== null)
          .map((job: {
            id: string;
            script: { title?: string; scenes?: Array<{ scene_number: string; dialogue?: string; scene_type?: string; action?: string }> };
            storyboard: unknown;
            chat: { title: string | null };
            createdAt: string;
            productName: string | null;
          }) => {
            const scriptData = job.script || {};
            const storyboardData = job.storyboard as Array<{ scene_number: string; prompt?: string }> | null;

            // Merge script scenes with storyboard prompts
            const scenes = (scriptData.scenes || []).map((scene: { scene_number: string; dialogue?: string; scene_type?: string; action?: string }) => {
              const storyboardScene = storyboardData?.find(s => s.scene_number === scene.scene_number);
              return {
                ...scene,
                prompt: storyboardScene?.prompt,
              };
            });

            return {
              id: job.id,
              title: scriptData.title || job.chat?.title || "Untitled",
              sceneCount: scenes.length,
              scenes,
              createdAt: job.createdAt,
              productName: job.productName,
            };
          });

        setScripts(extracted);
      } catch {
        toast.error("Failed to load scripts");
      } finally {
        setLoading(false);
      }
    }

    fetchScripts();
  }, []);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const formatScriptText = (script: Script) => {
    return script.scenes
      .map((scene, i) => {
        const parts = [
          `Scene ${i + 1}${scene.scene_type ? ` (${scene.scene_type})` : ""}`,
          scene.dialogue ? `Dialogue: "${scene.dialogue}"` : "",
          scene.action ? `Action: ${scene.action}` : "",
          scene.prompt ? `\nPrompt: ${scene.prompt}` : "",
        ].filter(Boolean);
        return parts.join("\n");
      })
      .join("\n\n---\n\n");
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Scripts</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-5 bg-muted rounded w-1/3" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scripts</h1>
          <p className="text-muted-foreground">
            All generated video scripts ({scripts.length} scripts)
          </p>
        </div>
        <Button asChild>
          <Link href="/generate">
            <Plus className="size-4 mr-2" />
            New Generation
          </Link>
        </Button>
      </div>

      {scripts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="size-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <FileText className="size-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              No scripts generated yet. Start by creating a new video.
            </p>
            <Link
              href="/generate"
              className="mt-4 inline-block text-primary hover:underline"
            >
              Create your first video
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {scripts.map((script) => (
            <Card key={script.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="size-4" />
                      {script.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {script.sceneCount} scenes
                      {script.productName && ` · ${script.productName}`}
                      {" · "}
                      {new Date(script.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => handleCopy(formatScriptText(script), script.id)}
                  >
                    {copiedId === script.id ? (
                      <>
                        <Check className="size-3" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        Copy All
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {script.scenes.length > 0 ? (
                  <div className="space-y-3">
                    {script.scenes.map((scene, i) => (
                      <div
                        key={scene.scene_number || i}
                        className="p-3 rounded-lg bg-muted/50 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            Scene {i + 1}
                            {scene.scene_type && ` · ${scene.scene_type}`}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => {
                              const text = [
                                scene.dialogue ? `"${scene.dialogue}"` : "",
                                scene.action ? `Action: ${scene.action}` : "",
                                scene.prompt ? `Prompt: ${scene.prompt}` : "",
                              ].filter(Boolean).join("\n");
                              handleCopy(text, `${script.id}-${i}`);
                            }}
                          >
                            {copiedId === `${script.id}-${i}` ? (
                              <Check className="size-3" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </Button>
                        </div>
                        {scene.dialogue && (
                          <p className="text-sm">"{scene.dialogue}"</p>
                        )}
                        {scene.action && (
                          <p className="text-xs text-muted-foreground">
                            {scene.action}
                          </p>
                        )}
                        {scene.prompt && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              View Imagen prompt
                            </summary>
                            <pre className="mt-2 p-2 bg-background rounded text-xs whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto">
                              {scene.prompt}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No scenes available
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
