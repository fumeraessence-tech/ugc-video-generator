"use client";

import { useState, useRef } from "react";
import { Sparkles, Loader2, AlertCircle, Pencil, Check, X, RefreshCw, Trash2, ChevronDown, ChevronUp, FileVideo, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMassGeneratorStore } from "@/stores/mass-generator-store";
import type { CreativeBrief, CompetitorAnalysis, OwnScriptAnalysis } from "@/types/mass-generator";
import { backendFetch } from "@/lib/backend-fetch";

export function BriefStep() {
  const {
    productDNA,
    platform,
    style,
    tone,
    duration,
    language,
    userPrompt,
    setUserPrompt,
    creativeBrief,
    setCreativeBrief,
    competitorAnalysis,
    setCompetitorAnalysis,
    ownScriptAnalysis,
    setOwnScriptAnalysis,
    ownScriptText,
    setOwnScriptText,
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
  const [videoExpanded, setVideoExpanded] = useState(false);
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  const [analyzingScript, setAnalyzingScript] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

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
            language,
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

  const analyzeCompetitorVideo = async () => {
    if (!videoFile) return;

    setAnalyzingVideo(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("video", videoFile);

      const response = await backendFetch(
        "/api/v1/mass-generator/analyze-competitor-video",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!data.success || !data.analysis) {
        throw new Error(data.error || "Failed to analyze video");
      }

      setCompetitorAnalysis(data.analysis as CompetitorAnalysis);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Video analysis failed";
      setError(message);
    } finally {
      setAnalyzingVideo(false);
    }
  };

  const analyzeOwnScript = async () => {
    if (!ownScriptText.trim() || ownScriptText.trim().length < 20) {
      setError("Please enter at least 20 characters of script text.");
      return;
    }

    setAnalyzingScript(true);
    setError(null);

    try {
      const response = await backendFetch(
        "/api/v1/mass-generator/analyze-own-script",
        {
          method: "POST",
          body: JSON.stringify({ script_text: ownScriptText }),
        }
      );

      const data = await response.json();

      if (!data.success || !data.analysis) {
        throw new Error(data.error || "Failed to analyze script");
      }

      setOwnScriptAnalysis(data.analysis as OwnScriptAnalysis);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Script analysis failed";
      setError(message);
    } finally {
      setAnalyzingScript(false);
    }
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

      {/* Optional: Competitor Video Analysis */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setVideoExpanded(!videoExpanded)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileVideo className="size-4" />
              Reference a Competitor Video
              <Badge variant="outline" className="text-xs font-normal">
                Optional
              </Badge>
              {competitorAnalysis && (
                <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                  Analyzed
                </Badge>
              )}
            </CardTitle>
            {videoExpanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        {videoExpanded && (
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Upload a competitor's video and our AI will transcribe and analyze it — hook strategy, pacing, CTA, strengths, and weaknesses. This analysis will inform your script generation.
            </p>

            {!competitorAnalysis ? (
              <>
                <div className="flex items-center gap-3">
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/mov,video/mpeg,video/avi,video/webm,video/quicktime"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 100 * 1024 * 1024) {
                          setError("Video file too large. Maximum size is 100MB.");
                          return;
                        }
                        setVideoFile(file);
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={analyzingVideo}
                  >
                    <Upload className="size-3 mr-1" />
                    {videoFile ? "Change Video" : "Select Video"}
                  </Button>
                  {videoFile && (
                    <span className="text-sm text-muted-foreground">
                      {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)}MB)
                    </span>
                  )}
                </div>
                {videoFile && (
                  <Button
                    onClick={analyzeCompetitorVideo}
                    disabled={analyzingVideo}
                    size="sm"
                  >
                    {analyzingVideo ? (
                      <>
                        <Loader2 className="size-3 mr-1 animate-spin" />
                        Analyzing Video (this may take a minute)...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3 mr-1" />
                        Analyze Video
                      </>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-2">
                  <p><span className="font-medium">Summary:</span> {competitorAnalysis.summary}</p>
                  <p><span className="font-medium">Hook:</span> {competitorAnalysis.hook_analysis}</p>
                  <div>
                    <span className="font-medium">Strengths:</span>
                    <ul className="list-disc list-inside ml-2">
                      {competitorAnalysis.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="font-medium">Weaknesses:</span>
                    <ul className="list-disc list-inside ml-2">
                      {competitorAnalysis.weaknesses.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCompetitorAnalysis(null);
                    setVideoFile(null);
                  }}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3 mr-1" />
                  Clear Analysis
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Optional: Own Script Analysis */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setScriptExpanded(!scriptExpanded)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="size-4" />
              Upload Your Own Script
              <Badge variant="outline" className="text-xs font-normal">
                Optional
              </Badge>
              {ownScriptAnalysis && (
                <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                  Analyzed
                </Badge>
              )}
            </CardTitle>
            {scriptExpanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        {scriptExpanded && (
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Paste your own script and our AI will deeply analyze it — structure, hook effectiveness, CTA strength, pacing, and naturalness. The generated script will be an improved version.
            </p>

            {!ownScriptAnalysis ? (
              <>
                <Textarea
                  placeholder="Paste your script here... (minimum 20 characters)"
                  value={ownScriptText}
                  onChange={(e) => setOwnScriptText(e.target.value)}
                  rows={6}
                  className="resize-none text-sm"
                />
                <Button
                  onClick={analyzeOwnScript}
                  disabled={analyzingScript || ownScriptText.trim().length < 20}
                  size="sm"
                >
                  {analyzingScript ? (
                    <>
                      <Loader2 className="size-3 mr-1 animate-spin" />
                      Analyzing Script...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3 mr-1" />
                      Analyze Script
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-2">
                  <p><span className="font-medium">Summary:</span> {ownScriptAnalysis.summary}</p>
                  <div className="flex gap-4">
                    <span>Hook: <strong>{ownScriptAnalysis.hook_score}/10</strong></span>
                    <span>CTA: <strong>{ownScriptAnalysis.cta_score}/10</strong></span>
                    <span>Naturalness: <strong>{ownScriptAnalysis.naturalness_score}/10</strong></span>
                  </div>
                  <div>
                    <span className="font-medium">Strengths:</span>
                    <ul className="list-disc list-inside ml-2">
                      {ownScriptAnalysis.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="font-medium">Improvements:</span>
                    <ul className="list-disc list-inside ml-2">
                      {ownScriptAnalysis.improvement_suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOwnScriptAnalysis(null);
                  }}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3 mr-1" />
                  Clear Analysis
                </Button>
              </div>
            )}
          </CardContent>
        )}
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
