"use client";

interface TimeRulerProps {
  duration: number;
  pixelsPerSecond: number;
}

export function TimeRuler({ duration, pixelsPerSecond }: TimeRulerProps) {
  const totalSeconds = Math.ceil(duration) + 5;
  const markers: number[] = [];

  // Generate markers every second
  for (let i = 0; i <= totalSeconds; i++) {
    markers.push(i);
  }

  return (
    <div className="h-6 border-b bg-muted/20 relative ml-24">
      {markers.map((sec) => {
        const x = sec * pixelsPerSecond;
        const isMajor = sec % 5 === 0;
        return (
          <div
            key={sec}
            className="absolute top-0 h-full"
            style={{ left: `${x}px` }}
          >
            <div
              className={cn(
                "w-px bg-border",
                isMajor ? "h-full" : "h-2 mt-4"
              )}
            />
            {isMajor && (
              <span className="absolute top-0 left-1 text-[9px] text-muted-foreground">
                {sec}s
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
