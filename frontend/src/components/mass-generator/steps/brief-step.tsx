"use client";

import { useState } from "react";
import { Sparkles, Loader2, AlertCircle, Pencil, Check, X, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useMassGeneratorStore } from "@/stores/mass-generator-store";
import type { CreativeBrief } from "@/types/mass-generator";
import { backendFetch } from "@/lib/backend-fetch";

export function BriefStep() {
  const {
    productDNA,
    platform,
    style,
    tone,
    duration,
    userPrompt,
    setUserPrompt,
    creativeBrief,
    setCreativeBrief,
    isLoading,
    setLoading,
    error,
    setError,
    prevStep,
    nextStep,
  } = useMassGeneratorStore();

  const [editingField, setEditingField] = useState<keyof CreativeBrief | null>(
    null
  );
  const [editValue, setEditValue] = useState("");

  const expandBrief = async () => {
    if (!userPrompt.trim()) {
      setError("Please enter a description of what you want.");
      return;
    }

    if (!productDNA) {
      setError("Product DNA is required. Please go back and analyze product.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await backendFetch(
        "/api/v1/mass-generator/expand-brief",
        {
          method: "POST",
          body: JSON.stringify({
            user_prompt: userPrompt,
            product_dna: productDNA,
            platform,
            style,
            tone,
            duration,
          }),
        }
      );

      const data = await response.json();

      if (!data.success || !data.brief) {
        throw new Error(data.error || "Failed to expand brief");
      }

      setCreativeBrief(data.brief as CreativeBrief);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Expansion failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (field: keyof CreativeBrief) => {
    if (!creativeBrief) return;
    setEditingField(field);
    const value = creativeBrief[field];
    setEditValue(
      Array.isArray(value) ? value.join("\n") : String(value || "")
    );
  };

  const saveEdit = () => {
    if (!creativeBrief || !editingField) return;

    const updatedBrief = { ...creativeBrief };
    if (editingField === "key_selling_points") {
      updatedBrief[editingField] = editValue
        .split("\n")
        .filter((s) => s.trim());
    } else {
      (updatedBrief as Record<string, unknown>)[editingField] = editValue;
    }

    setCreativeBrief(updatedBrief);
    setEditingField(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const canProceed = creativeBrief !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Creative Brief</h2>
        <p className="text-muted-foreground">
          Describe what you want, and our AI will expand it into a detailed
          creative strategy.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* User Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What do you want to create?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Example: Create a video showcasing this luxury perfume. Highlight the long-lasting oud scent and elegant packaging. Target young professionals who appreciate premium fragrances."
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <Button
            onClick={expandBrief}
            disabled={isLoading || !userPrompt.trim()}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Expanding Brief...
              </>
            ) : (
              <>
                <Sparkles className="size-4 mr-2" />
                Expand with AI
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Expanded Brief */}
      {creativeBrief && (
        <Card className="border-primary/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                AI-Expanded Creative Brief
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={expandBrief}
                  disabled={isLoading}
                  title="Regenerate brief"
                >
                  <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreativeBrief(null)}
                  className="text-destructive hover:text-destructive"
                  title="Clear brief"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Hook Strategy */}
            <BriefField
              label="Hook Strategy"
              sublabel="How to grab attention in the first 3 seconds"
              value={creativeBrief.hook_strategy}
              isEditing={editingField === "hook_strategy"}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onStartEdit={() => startEditing("hook_strategy")}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />

            {/* Pain Point */}
            <BriefField
              label="Pain Point"
              sublabel="The problem your audience experiences"
              value={creativeBrief.pain_point}
              isEditing={editingField === "pain_point"}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onStartEdit={() => startEditing("pain_point")}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />

            {/* Key Selling Points */}
            <BriefField
              label="Key Selling Points"
              sublabel="Main benefits to highlight"
              value={creativeBrief.key_selling_points.join("\n")}
              displayValue={
                <ul className="list-disc list-inside space-y-1">
                  {creativeBrief.key_selling_points.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              }
              isEditing={editingField === "key_selling_points"}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onStartEdit={() => startEditing("key_selling_points")}
              onSave={saveEdit}
              onCancel={cancelEdit}
              multiline
            />

            {/* Emotional Journey */}
            <BriefField
              label="Emotional Journey"
              sublabel="The viewer's emotional arc"
              value={creativeBrief.emotional_journey}
              isEditing={editingField === "emotional_journey"}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onStartEdit={() => startEditing("emotional_journey")}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />

            {/* CTA Approach */}
            <BriefField
              label="Call to Action"
              sublabel="How to close the sale"
              value={creativeBrief.cta_approach}
              isEditing={editingField === "cta_approach"}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onStartEdit={() => startEditing("cta_approach")}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />

            {/* Unique Angle */}
            {creativeBrief.unique_angle && (
              <BriefField
                label="Unique Angle"
                sublabel="What makes this video different"
                value={creativeBrief.unique_angle}
                isEditing={editingField === "unique_angle"}
                editValue={editValue}
                onEditValueChange={setEditValue}
                onStartEdit={() => startEditing("unique_angle")}
                onSave={saveEdit}
                onCancel={cancelEdit}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>
          Back
        </Button>
        <Button onClick={nextStep} disabled={!canProceed} size="lg">
          Next: Generate Script
        </Button>
      </div>
    </div>
  );
}

// Editable field component
interface BriefFieldProps {
  label: string;
  sublabel: string;
  value: string;
  displayValue?: React.ReactNode;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (value: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  multiline?: boolean;
}

function BriefField({
  label,
  sublabel,
  value,
  displayValue,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSave,
  onCancel,
  multiline,
}: BriefFieldProps) {
  return (
    <div className="border-b border-border pb-4 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h4 className="font-medium">{label}</h4>
          <p className="text-xs text-muted-foreground mb-2">{sublabel}</p>
          {isEditing ? (
            <div className="space-y-2">
              {multiline ? (
                <Textarea
                  value={editValue}
                  onChange={(e) => onEditValueChange(e.target.value)}
                  rows={4}
                  className="resize-none"
                  placeholder="One item per line"
                />
              ) : (
                <Input
                  value={editValue}
                  onChange={(e) => onEditValueChange(e.target.value)}
                />
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={onSave}>
                  <Check className="size-3 mr-1" />
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel}>
                  <X className="size-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm">{displayValue || value}</div>
          )}
        </div>
        {!isEditing && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onStartEdit}
          >
            <Pencil className="size-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
