"use client";

import { useRouter } from "next/navigation";
import {
  Star,
  Package,
  Film,
  Smartphone,
  BookOpen,
  Mic,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Category {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  count: number;
  prompt: string;
}

const CATEGORIES: Category[] = [
  {
    id: "testimonials",
    name: "Testimonials",
    description: "Authentic reviews and customer stories that build trust and credibility for your brand.",
    icon: Star,
    count: 12,
    prompt: "Create a UGC testimonial video where I share my authentic experience with [product name]. Make it relatable and honest.",
  },
  {
    id: "product-showcase",
    name: "Product Showcase",
    description: "Highlight product features, benefits, and use cases with polished visual presentations.",
    icon: Package,
    count: 8,
    prompt: "Create a product showcase video for [product name]. Highlight the key features and show it in action.",
  },
  {
    id: "brand-narrative",
    name: "Brand Narrative",
    description: "Cinematic storytelling videos that communicate your brand mission, values, and identity.",
    icon: Film,
    count: 6,
    prompt: "Create a brand story video that tells the story behind [brand/product]. Make it emotional and inspiring.",
  },
  {
    id: "social-reels",
    name: "Social Reels",
    description: "Short-form, high-energy clips optimized for Instagram Reels, TikTok, and YouTube Shorts.",
    icon: Smartphone,
    count: 15,
    prompt: "Create a viral social reel for [product name]. Make it fast-paced with a strong hook in the first 3 seconds.",
  },
  {
    id: "tutorials",
    name: "Tutorials",
    description: "Clear step-by-step instructional videos with annotations, demos, and how-to guides.",
    icon: BookOpen,
    count: 10,
    prompt: "Create a tutorial video showing how to use [product name]. Make it clear and easy to follow with step-by-step instructions.",
  },
  {
    id: "interviews",
    name: "Interviews",
    description: "Professional Q&A format videos with conversational flow, great for thought leadership.",
    icon: Mic,
    count: 5,
    prompt: "Create an interview-style video where I answer common questions about [product/topic]. Make it conversational and natural.",
  },
];

export default function CategoriesPage() {
  const router = useRouter();

  const handleCategoryClick = async (category: Category) => {
    // Create a new chat and navigate to it with the prompt
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: category.name }),
      });

      if (res.ok) {
        const { chat } = await res.json();
        router.push(`/chat/${chat.id}?prompt=${encodeURIComponent(category.prompt)}`);
      }
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Choose a video template to get started with AI-powered script generation.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <Card
              key={category.id}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
              onClick={() => handleCategoryClick(category)}
            >
              <CardContent className="p-6">
                <div className="mb-4 inline-flex size-12 items-center justify-center rounded-lg bg-secondary">
                  <Icon className="size-6 text-secondary-foreground" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{category.name}</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  {category.description}
                </p>
                <Badge variant="secondary" className="text-xs">
                  {category.count} templates
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
