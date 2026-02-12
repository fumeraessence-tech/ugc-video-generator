"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Clock, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ---------- Template Data ----------

interface Template {
  id: string;
  title: string;
  description: string;
  duration: string;
  category: string;
  prompt: string;
}

const TEMPLATES: Template[] = [
  {
    id: "product-testimonial",
    title: "30s Product Testimonial",
    description:
      "A person reviewing and sharing their genuine experience with a product. Builds trust through authentic storytelling.",
    duration: "30s",
    category: "testimonials",
    prompt:
      "Create a 30-second product testimonial video. Show a person genuinely reviewing a product, highlighting key benefits and their personal experience. Include close-up product shots and authentic reactions.",
  },
  {
    id: "brand-story",
    title: "60s Brand Story",
    description:
      "A compelling narrative-driven brand video that tells your story, mission, and values in a cinematic format.",
    duration: "60s",
    category: "brand",
    prompt:
      "Create a 60-second brand story video. Craft a compelling narrative about a brand's mission, values, and journey. Use cinematic visuals, emotional storytelling, and a strong call to action at the end.",
  },
  {
    id: "social-reel",
    title: "15s Social Reel",
    description:
      "A quick, attention-grabbing clip optimized for social media feeds. High energy with fast cuts and trending vibes.",
    duration: "15s",
    category: "social",
    prompt:
      "Create a 15-second social media reel. Make it attention-grabbing with fast cuts, dynamic transitions, bold text overlays, and high energy. Optimized for vertical viewing on Instagram and TikTok.",
  },
  {
    id: "tutorial",
    title: "45s Tutorial",
    description:
      "A clear how-to demonstration video. Step-by-step instructions with visual aids and on-screen annotations.",
    duration: "45s",
    category: "tutorials",
    prompt:
      "Create a 45-second tutorial video. Present a clear step-by-step how-to demonstration with numbered steps, visual aids, on-screen annotations, and a summary at the end. Keep it concise and easy to follow.",
  },
  {
    id: "before-after",
    title: "30s Before/After",
    description:
      "A dramatic transformation showcase. Perfect for revealing results, makeovers, and product effectiveness.",
    duration: "30s",
    category: "testimonials",
    prompt:
      "Create a 30-second before/after transformation video. Show a dramatic split-screen or sequential reveal of a transformation. Build suspense before the reveal and highlight the key differences with annotations.",
  },
  {
    id: "interview-style",
    title: "60s Interview Style",
    description:
      "A professional Q&A format video. Conversational tone with on-screen questions and thoughtful responses.",
    duration: "60s",
    category: "interviews",
    prompt:
      "Create a 60-second interview-style video. Use a Q&A format with on-screen questions, a conversational tone, and thoughtful responses. Include lower-third name titles and a professional setting.",
  },
];

// ---------- Main Page ----------

export default function ExplorePage() {
  const router = useRouter();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  async function handleTryTemplate(template: Template) {
    setCreatingId(template.id);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: template.title }),
      });
      if (!res.ok) throw new Error("Failed to create chat");
      const data = await res.json();
      const chatId = data.chat.id;

      // Send the template prompt as the first message
      await fetch(`/api/chat/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content: template.prompt,
        }),
      });

      router.push(`/chat/${chatId}`);
    } catch {
      toast.error("Failed to create from template");
      setCreatingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6 md:p-8">
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <Sparkles className="size-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Explore Templates</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Get started quickly with professionally crafted video templates.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((template) => (
          <Card
            key={template.id}
            className="group overflow-hidden p-0 transition-all hover:shadow-lg"
          >
            {/* Thumbnail */}
            <div
              className="relative flex aspect-[16/10] items-center justify-center bg-secondary"
            >
              <Play className="size-10 text-white/70 transition-transform group-hover:scale-110" />
              <Badge
                variant="secondary"
                className="absolute top-3 right-3 bg-black/50 text-white backdrop-blur-sm"
              >
                <Clock className="mr-1 size-3" />
                {template.duration}
              </Badge>
            </div>

            <CardHeader className="pb-2">
              <CardTitle className="text-base">{template.title}</CardTitle>
              <CardDescription className="line-clamp-2 text-xs">
                {template.description}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-0 pb-4">
              <Button
                className="w-full"
                onClick={() => handleTryTemplate(template)}
                disabled={creatingId === template.id}
              >
                {creatingId === template.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Try This
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
