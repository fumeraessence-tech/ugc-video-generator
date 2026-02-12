"use client";

import { useCallback } from "react";
import { Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { MessageData } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import { ScriptPreview } from "@/components/chat/message-parts/script-preview";
import { StoryboardGallery } from "@/components/chat/message-parts/storyboard-gallery";
import { VideoPlayerInline } from "@/components/chat/message-parts/video-player-inline";
import { ProgressStepper } from "@/components/chat/message-parts/progress-stepper";
import { QualityScore } from "@/components/chat/message-parts/quality-score";
import { ConsistencyAdvisor } from "@/components/chat/message-parts/consistency-advisor";
import { QualityGate } from "@/components/chat/message-parts/quality-gate";

interface MessageBubbleProps {
  message: MessageData;
  isStreaming?: boolean;
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const metadata = message.metadata;
  const { updateScene, activeJobId } = useChatStore();

  const jobId = (metadata?.jobId as string) || activeJobId;

  const handleSceneEdit = useCallback(
    (sceneNumber: number, updates: Partial<Record<string, unknown>>) => {
      updateScene(sceneNumber, updates as Partial<{ description: string; dialogue: string; direction: string }>);
    },
    [updateScene]
  );

  const handleRegenerateScene = useCallback(
    async (sceneNumber: number) => {
      if (!jobId) return;
      try {
        await fetch("/api/storyboard/regenerate-scene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, sceneNumber }),
        });
      } catch (err) {
        console.error("Scene regeneration failed:", err);
      }
    },
    [jobId]
  );

  const handleRegenerateAll = useCallback(async () => {
    if (!jobId) return;
    const editedScript = useChatStore.getState().getEditedScript();
    if (!editedScript) return;
    try {
      await fetch("/api/storyboard/regenerate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, updatedScript: editedScript }),
      });
    } catch (err) {
      console.error("Full regeneration failed:", err);
    }
  }, [jobId]);

  const handleSaveEdits = useCallback(
    (scenes: Array<{ number: number; description: string; dialogue?: string; direction?: string }>) => {
      useChatStore.getState().setOriginalScript(scenes);
    },
    []
  );

  const handleApproveFrame = useCallback(
    async (frameId: string) => {
      if (!jobId) return;
      try {
        await fetch(`/api/jobs/${jobId}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "approve", frameId }),
        });
      } catch (err) {
        console.error("Frame approval failed:", err);
      }
    },
    [jobId]
  );

  const handleRejectFrame = useCallback(
    async (frameId: string) => {
      if (!jobId) return;
      try {
        await fetch(`/api/jobs/${jobId}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "reject", frameId }),
        });
      } catch (err) {
        console.error("Frame rejection failed:", err);
      }
    },
    [jobId]
  );

  const handleRegenerateFrame = useCallback(
    async (frameId: string) => {
      if (!jobId) return;
      const sceneNumber = parseInt(frameId.split("-scene-")[1] || "0");
      if (sceneNumber) {
        await handleRegenerateScene(sceneNumber);
      }
    },
    [jobId, handleRegenerateScene]
  );

  const handleRegenerateFromEdit = useCallback(
    async (sceneNumber: number) => {
      const editedScript = useChatStore.getState().getEditedScript();
      const updatedScene = editedScript?.find((s) => s.number === sceneNumber);
      if (!jobId || !updatedScene) return;
      try {
        await fetch("/api/storyboard/regenerate-scene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            sceneNumber,
            updatedScript: updatedScene,
          }),
        });
      } catch (err) {
        console.error("Regenerate from edit failed:", err);
      }
    },
    [jobId]
  );

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-2",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div className="shrink-0 pt-1">
        {isUser ? (
          <Avatar size="sm">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <User className="size-3.5" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <Avatar size="sm">
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              <Bot className="size-3.5" />
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        )}
      >
        {isAssistant ? (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
            {message.content.split("\n").map((line, i) => (
              <p key={i}>{line || "\u00A0"}</p>
            ))}
            {isStreaming && (
              <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-current" />
            )}
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}

        {/* Timestamp */}
        <p
          className={cn(
            "mt-1 text-[10px] opacity-60",
            isUser ? "text-right" : "text-left"
          )}
        >
          {formatTimestamp(message.createdAt)}
        </p>

        {/* Rich content based on metadata */}
        {metadata?.type === "script" && (
          <ScriptPreview
            title={metadata.title as string | undefined}
            scenes={(metadata.scenes as any[]) ?? []}
            editable={!!jobId}
            onSceneEdit={handleSceneEdit}
            onRegenerateScene={handleRegenerateScene}
            onRegenerateAll={handleRegenerateAll}
            onSaveEdits={handleSaveEdits}
          />
        )}
        {metadata?.type === "storyboard" && (
          <StoryboardGallery
            frames={(metadata.frames as any[]) ?? []}
            script={(metadata.script as any[]) ?? undefined}
            consistencyScores={(metadata.consistencyScores as any[]) ?? undefined}
            onApprove={jobId ? handleApproveFrame : undefined}
            onReject={jobId ? handleRejectFrame : undefined}
            onRegenerate={jobId ? handleRegenerateFrame : undefined}
            onEditScene={jobId ? handleSceneEdit : undefined}
            onRegenerateFromEdit={jobId ? handleRegenerateFromEdit : undefined}
          />
        )}
        {metadata?.type === "video" && (
          <VideoPlayerInline
            url={metadata.url as string}
            title={metadata.title as string | undefined}
          />
        )}
        {metadata?.type === "progress" && (
          <ProgressStepper
            steps={(metadata.steps as any[]) ?? []}
          />
        )}
        {metadata?.type === "quality" && (
          <QualityScore
            score={(metadata.score as number) ?? 0}
            label={metadata.label as string | undefined}
            details={metadata.details as any[] | undefined}
          />
        )}
        {metadata?.type === "consistency_advisor" && (
          <ConsistencyAdvisor
            avatarName={metadata.avatarName as string | undefined}
            angleCoverage={metadata.angleCoverage as Record<string, string> | undefined}
            previousScores={metadata.previousScores as Array<{ scene: string | number; score: number }> | undefined}
          />
        )}
        {metadata?.type === "quality_gate" && jobId && (
          <QualityGate
            jobId={jobId}
            scores={(metadata.scores as Array<{ scene: string | number; score: number }>) ?? []}
            threshold={(metadata.threshold as number) ?? 0.75}
            onAccept={async () => {
              await fetch(`/api/jobs/${jobId}/decision`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decision: "approve" }),
              });
            }}
            onRegenerateOutliers={async (sceneNumbers) => {
              await fetch(`/api/jobs/${jobId}/decision`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decision: "regenerate_outliers", sceneNumbers }),
              });
            }}
            onRegenerateAll={async () => {
              await fetch(`/api/jobs/${jobId}/decision`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decision: "regenerate_all" }),
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
