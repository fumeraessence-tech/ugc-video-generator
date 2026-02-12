"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Video,
  MessageSquare,
  Loader2,
  Film,
  CheckCircle2,
  Circle,
  Settings,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat/chat-input";
import { useChatStore } from "@/stores/chat-store";

interface QuickAction {
  title: string;
  description: string;
  prompt: string;
  icon: React.ReactNode;
}

const quickActions: QuickAction[] = [
  {
    title: "UGC Testimonial",
    description: "Create an authentic customer testimonial video",
    prompt:
      "I want to create a UGC testimonial video. Help me write a compelling script for a customer sharing their experience with the product.",
    icon: <MessageSquare className="size-6" />,
  },
  {
    title: "Product Showcase",
    description: "Showcase your product with a dynamic video",
    prompt:
      "I need a product showcase video. Help me create a script that highlights the key features and benefits in an engaging way.",
    icon: <Video className="size-6" />,
  },
  {
    title: "Brand Story",
    description: "Tell your brand's story in a compelling way",
    prompt:
      "I want to create a brand story video. Help me craft a narrative that connects with the audience emotionally and communicates our brand values.",
    icon: <Sparkles className="size-6" />,
  },
  {
    title: "Social Reel",
    description: "Create a short-form video for social media",
    prompt:
      "I want to create a short social media reel. Help me write a punchy, attention-grabbing script that works well in under 30 seconds.",
    icon: <Film className="size-6" />,
  },
];

export default function ChatPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [showSettingsGuide, setShowSettingsGuide] = useState(true);

  // Get current settings from store
  const productName = useChatStore((s) => s.productName);
  const productImages = useChatStore((s) => s.productImages);
  const backgroundSetting = useChatStore((s) => s.backgroundSetting);
  const platform = useChatStore((s) => s.platform);
  const aspectRatio = useChatStore((s) => s.aspectRatio);
  const duration = useChatStore((s) => s.duration);

  // Check if essential settings are configured
  const hasProductInfo = (productName && productName.trim() !== "") || productImages.length > 0;
  const hasBasicSettings = backgroundSetting && platform && aspectRatio && duration;

  const createChatAndNavigate = useCallback(
    async (prompt: string, title?: string) => {
      if (isCreating) return;
      setIsCreating(true);

      try {
        // Create a new chat
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title || null }),
        });

        if (!res.ok) throw new Error("Failed to create chat");

        const data: { chat: { id: string } } = await res.json();
        const chatId = data.chat.id;

        // Send the initial message
        await fetch(`/api/chat/${chatId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: prompt }),
        });

        // Navigate to the chat
        router.push(`/chat/${chatId}`);
      } catch (error) {
        console.error("Failed to create chat:", error);
        setIsCreating(false);
      }
    },
    [isCreating, router]
  );

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      createChatAndNavigate(action.prompt, action.title);
    },
    [createChatAndNavigate]
  );

  const handleSend = useCallback(
    (content: string) => {
      createChatAndNavigate(content);
    },
    [createChatAndNavigate]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Main content area */}
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-2xl space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-secondary">
              <Sparkles className="size-6 text-muted-foreground" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              What would you like to create?
            </h1>
            <p className="text-muted-foreground text-base">
              Choose a template to get started, or describe your video idea below.
            </p>
          </div>

          {/* Settings Guide */}
          {showSettingsGuide && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Settings className="size-5 text-primary" />
                      <h3 className="font-semibold text-sm">Quick Setup Guide</h3>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        {hasProductInfo ? (
                          <CheckCircle2 className="size-4 text-green-600" />
                        ) : (
                          <Circle className="size-4 text-muted-foreground" />
                        )}
                        <span className={hasProductInfo ? "text-green-600 font-medium" : ""}>
                          Product details {hasProductInfo && "✓"}
                        </span>
                        {!hasProductInfo && (
                          <Badge variant="outline" className="ml-auto text-xs">
                            Optional
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {hasBasicSettings ? (
                          <CheckCircle2 className="size-4 text-green-600" />
                        ) : (
                          <Circle className="size-4 text-muted-foreground" />
                        )}
                        <span className={hasBasicSettings ? "text-green-600 font-medium" : ""}>
                          Video settings (platform, background, etc.) {hasBasicSettings && "✓"}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground pt-2">
                      💡 <strong>Next step:</strong> Click the settings icon (⚙️) in the bottom-right to configure your video preferences, or start chatting to generate a video with default settings.
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettingsGuide(false)}
                    className="shrink-0"
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick action cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Card
                key={action.title}
                className="group cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
                onClick={() => handleQuickAction(action)}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:bg-secondary/80">
                    {action.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm">{action.title}</h3>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      {action.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Loading overlay */}
        {isCreating && (
          <div className="mt-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Creating your chat...</span>
          </div>
        )}
      </div>

      {/* Chat input at bottom */}
      <ChatInput
        onSend={handleSend}
        isStreaming={isCreating}
        placeholder="Describe your video idea..."
      />
    </div>
  );
}
