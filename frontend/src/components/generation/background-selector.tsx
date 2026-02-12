"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Bed, UtensilsCrossed, Briefcase, Car, Trees, Palette } from "lucide-react";

interface BackgroundSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const BACKGROUND_OPTIONS = [
  {
    value: "modern_bedroom",
    label: "Modern Bedroom",
    icon: Bed,
    description: "Cozy natural light, minimalist decor",
  },
  {
    value: "kitchen",
    label: "Kitchen",
    icon: UtensilsCrossed,
    description: "Bright, clean, organized space",
  },
  {
    value: "office",
    label: "Office",
    icon: Briefcase,
    description: "Professional desk setup",
  },
  {
    value: "car",
    label: "Car Interior",
    icon: Car,
    description: "Modern vehicle interior",
  },
  {
    value: "outdoor",
    label: "Outdoor",
    icon: Trees,
    description: "Natural lighting, golden hour",
  },
  {
    value: "custom",
    label: "Custom",
    icon: Palette,
    description: "User-defined background",
  },
];

export function BackgroundSelector({ value, onChange }: BackgroundSelectorProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Background Setting</h3>
        <p className="text-xs text-muted-foreground">
          Choose the environment for your video
        </p>
      </div>

      <RadioGroup value={value} onValueChange={onChange}>
        <div className="grid grid-cols-2 gap-3">
          {BACKGROUND_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = value === option.value;

            return (
              <Card
                key={option.value}
                className={`cursor-pointer transition-all hover:border-primary/50 ${
                  isSelected ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => onChange(option.value)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <RadioGroupItem
                      value={option.value}
                      id={option.value}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4 shrink-0" />
                        <Label
                          htmlFor={option.value}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {option.label}
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </RadioGroup>
    </div>
  );
}
