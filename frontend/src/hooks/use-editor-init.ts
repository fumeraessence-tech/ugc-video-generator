"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { useMassGeneratorStore } from "@/stores/mass-generator-store";
import type { TimelineClip, ScriptSceneData } from "@/types/editor";

/**
 * Hook that reads mass-generator store on mount and initializes the editor store.
 * Called once when the VideoEditor component loads.
 */
export function useEditorInit() {
  const initialized = useRef(false);
  const { projectId, initializeFromWizard } = useEditorStore();
  const { script, productName, brandName } = useMassGeneratorStore();

  useEffect(() => {
    if (initialized.current) return;
    // Already have a project loaded in editor — skip
    if (projectId) return;
    // No script available from wizard — nothing to initialize
    if (!script?.scenes?.length) return;

    initialized.current = true;

    // Build scene clips from the wizard's script scenes
    // Each scene gets a placeholder clip (video URL comes from video-step generation)
    const sceneClips: Record<number, TimelineClip[]> = {};
    const scriptScenes: ScriptSceneData[] = [];

    script.scenes.forEach((scene, idx) => {
      const sceneNum = idx + 1;

      scriptScenes.push({
        sceneNumber: sceneNum,
        dialogue: scene.dialogue || "",
        action: scene.action || "",
        sceneType: scene.scene_type || "hook",
        duration: scene.duration_seconds || 5,
      });

      // Create a default clip per scene
      sceneClips[sceneNum] = [
        {
          id: `clip-${sceneNum}-1`,
          sceneNumber: sceneNum,
          clipNumber: 1,
          videoUrl: "", // Will be populated when videos are generated
          duration: scene.duration_seconds || 5,
          trimStart: 0,
          trimEnd: 0,
          order: idx,
        },
      ];
    });

    const id = `${(productName || brandName || "project").toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

    initializeFromWizard({
      projectId: id,
      sceneClips,
      scriptScenes,
    });
  }, [projectId, script, productName, brandName, initializeFromWizard]);
}
