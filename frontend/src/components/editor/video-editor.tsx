"use client";

import { useEffect, useState } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { EditorToolbar } from "./editor-toolbar";
import { TimelineEditor } from "./timeline/timeline-editor";
import { VideoPreviewPanel } from "./preview/video-preview-panel";
import { PropertiesPanel } from "./panels/properties-panel";
import { ClipSelector } from "./clip-selector";
import { ExportDialog } from "./export-dialog";
import { AlertCircle, Film } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function VideoEditor() {
  const { timelineClips, projectId } = useEditorStore();
  const [showClipSelector, setShowClipSelector] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Show clip selector on first load if no clips in timeline
  useEffect(() => {
    if (!projectId && timelineClips.length === 0) {
      // No project loaded - user navigated directly
    }
  }, [projectId, timelineClips.length]);

  // Empty state - no project loaded
  if (!projectId && timelineClips.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto size-16 rounded-full bg-muted flex items-center justify-center">
            <Film className="size-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">No Project Loaded</h2>
          <p className="text-muted-foreground text-sm">
            Generate video clips first in the Mass Generator wizard, then
            continue to the editor to assemble your final video.
          </p>
          <Alert>
            <AlertCircle className="size-4" />
            <AlertDescription>
              Go to Generate → create your video clips → click "Continue to
              Editor"
            </AlertDescription>
          </Alert>
          <Button asChild>
            <Link href="/generate">Go to Generator</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background overflow-hidden">
      {/* Toolbar */}
      <EditorToolbar
        onOpenClipSelector={() => setShowClipSelector(true)}
        onOpenExport={() => setShowExport(true)}
      />

      {/* Main content area: Preview + Properties */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video Preview */}
        <div className="flex-[3] min-w-0 border-r">
          <VideoPreviewPanel />
        </div>

        {/* Properties Panel */}
        <div className="flex-[2] min-w-0 overflow-y-auto">
          <PropertiesPanel />
        </div>
      </div>

      {/* Timeline */}
      <div className="h-[300px] border-t flex-shrink-0 overflow-hidden">
        <TimelineEditor />
      </div>

      {/* Clip Selector Dialog */}
      <ClipSelector
        open={showClipSelector}
        onOpenChange={setShowClipSelector}
      />

      {/* Export Dialog */}
      <ExportDialog open={showExport} onOpenChange={setShowExport} />
    </div>
  );
}
