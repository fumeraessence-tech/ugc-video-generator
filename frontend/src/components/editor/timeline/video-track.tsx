"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEditorStore } from "@/stores/editor-store";
import type { TimelineClip } from "@/types/editor";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

interface VideoTrackProps {
  pixelsPerSecond: number;
}

export function VideoTrack({ pixelsPerSecond }: VideoTrackProps) {
  const { timelineClips, reorderClips, setSelectedClip, selectedClipId, transitions } =
    useEditorStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = timelineClips.findIndex((c) => c.id === active.id);
    const newIndex = timelineClips.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...timelineClips];
    const [moved] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, moved);
    reorderClips(newOrder.map((c) => c.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={timelineClips.map((c) => c.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex items-center h-full gap-0.5 px-1">
          {timelineClips.map((clip, idx) => (
            <div key={clip.id} className="flex items-center">
              <SortableClipItem
                clip={clip}
                pixelsPerSecond={pixelsPerSecond}
                isSelected={selectedClipId === clip.id}
                onClick={() => setSelectedClip(clip.id)}
              />
              {/* Transition slot between clips */}
              {idx < timelineClips.length - 1 && (
                <div
                  className="w-1 h-full bg-muted-foreground/20 hover:bg-primary/50 cursor-pointer transition-colors mx-0.5 rounded"
                  title="Add transition"
                />
              )}
            </div>
          ))}
          {timelineClips.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              No clips on timeline. Select clips to add.
            </div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableClipItemProps {
  clip: TimelineClip;
  pixelsPerSecond: number;
  isSelected: boolean;
  onClick: () => void;
}

function SortableClipItem({
  clip,
  pixelsPerSecond,
  isSelected,
  onClick,
}: SortableClipItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: clip.id });

  const effectiveDuration = clip.duration - clip.trimStart - clip.trimEnd;
  const width = Math.max(effectiveDuration * pixelsPerSecond, 40);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: `${width}px`,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        "h-12 rounded border-2 flex items-center gap-1 px-1 cursor-pointer transition-colors overflow-hidden",
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border bg-muted hover:border-muted-foreground/50"
      )}
      onClick={onClick}
    >
      <div {...listeners} className="cursor-grab shrink-0">
        <GripVertical className="size-3 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium truncate">
          S{clip.sceneNumber}
        </div>
        <div className="text-[9px] text-muted-foreground">
          {effectiveDuration.toFixed(1)}s
        </div>
      </div>
    </div>
  );
}
