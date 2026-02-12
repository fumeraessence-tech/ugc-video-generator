"use client";

import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface QualityScoreProps {
  score: number;
  label?: string;
  details?: { name: string; value: number }[];
}

export function QualityScore({ score, label, details }: QualityScoreProps) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-500";
    if (s >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="mt-3 rounded-lg border bg-secondary/30 p-4">
      <div className="flex items-center gap-3">
        <Shield className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{label ?? "Quality Score"}</p>
          <p className={cn("text-2xl font-bold", getScoreColor(score))}>
            {score}/100
          </p>
        </div>
      </div>
      {details && details.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {details.map((d) => (
            <div key={d.name} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{d.name}</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      getScoreColor(d.value),
                      "bg-current"
                    )}
                    style={{ width: `${d.value}%` }}
                  />
                </div>
                <span className="text-xs font-medium w-8 text-right">
                  {d.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
