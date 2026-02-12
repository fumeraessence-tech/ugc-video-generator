"use client";

import { useEditorStore } from "@/stores/editor-store";

interface PlayheadProps {
  pixelsPerSecond: number;
}

export function Playhead({ pixelsPerSecond }: PlayheadProps) {
  const { currentTime } = useEditorStore();
  const x = currentTime * pixelsPerSecond + 96; // 96px = track label width (w-24)

  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none"
      style={{ left: `${x}px` }}
    >
      {/* Playhead handle */}
      <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-2.5 h-3 bg-red-500 rounded-b" />
    </div>
  );
}
