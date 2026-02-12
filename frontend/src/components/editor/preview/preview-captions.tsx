"use client";

import { useEditorStore } from "@/stores/editor-store";

export function PreviewCaptions() {
  const { captions, captionStyle, currentTime } = useEditorStore();

  // Find active captions at currentTime
  const activeCaptions = captions.filter(
    (c) => currentTime >= c.startTime && currentTime <= c.endTime
  );

  if (activeCaptions.length === 0) return null;

  const positionClass =
    captionStyle.position === "top"
      ? "top-4"
      : captionStyle.position === "center"
        ? "top-1/2 -translate-y-1/2"
        : "bottom-8";

  const alignClass =
    captionStyle.alignment === "left"
      ? "text-left"
      : captionStyle.alignment === "right"
        ? "text-right"
        : "text-center";

  return (
    <div
      className={`absolute left-0 right-0 ${positionClass} flex flex-col items-center pointer-events-none px-4`}
    >
      {activeCaptions.map((caption) => (
        <div
          key={caption.id}
          className={`${alignClass} animate-fade-in`}
          style={{
            fontFamily: captionStyle.fontFamily,
            fontSize: `${captionStyle.fontSize}px`,
            fontWeight: captionStyle.fontWeight === "extrabold" ? 800 : captionStyle.fontWeight === "bold" ? 700 : 400,
            color: captionStyle.color,
            backgroundColor: `${captionStyle.backgroundColor}${Math.round(captionStyle.backgroundOpacity * 2.55).toString(16).padStart(2, "0")}`,
            WebkitTextStroke: captionStyle.outlineWidth > 0
              ? `${captionStyle.outlineWidth}px ${captionStyle.outlineColor}`
              : undefined,
            maxWidth: `${captionStyle.maxWidth}%`,
            padding: "4px 12px",
            borderRadius: "4px",
          }}
        >
          {caption.text}
        </div>
      ))}
    </div>
  );
}
