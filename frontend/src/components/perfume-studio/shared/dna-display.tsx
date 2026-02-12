"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export function DNADisplay({
  title,
  data,
  color = "violet",
}: {
  title: string;
  data: Record<string, unknown> | null;
  color?: "violet" | "blue" | "pink" | "amber" | "green";
}) {
  const [expanded, setExpanded] = useState(false);

  if (!data) return null;

  const colorMap = {
    violet: "border-violet-500/30 bg-violet-500/5",
    blue: "border-blue-500/30 bg-blue-500/5",
    pink: "border-pink-500/30 bg-pink-500/5",
    amber: "border-amber-500/30 bg-amber-500/5",
    green: "border-green-500/30 bg-green-500/5",
  };

  const entries = Object.entries(data).filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)
  );

  return (
    <div className={`rounded-lg border p-3 ${colorMap[color]}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground ml-auto">{entries.length} fields</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5 text-xs">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="font-medium text-muted-foreground min-w-[100px] capitalize">
                {key.replace(/_/g, " ")}:
              </span>
              <span className="text-foreground break-words">
                {Array.isArray(value) ? value.join(", ") : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
