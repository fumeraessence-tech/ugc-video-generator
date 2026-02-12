/**
 * WPM Calculator and Scene Duration Validator
 *
 * Ensures dialogue fits within Gemini's 8-second scene constraint.
 * Natural Indian English pace: 150 WPM
 */

export interface WPMValidation {
  wordCount: number;
  duration: number; // in seconds
  isValid: boolean;
  maxWords: number;
  warningMessage?: string;
}

/**
 * Calculate duration from word count based on WPM
 */
export function calculateDuration(
  wordCount: number,
  wordsPerMinute: number = 150
): number {
  return (wordCount / wordsPerMinute) * 60;
}

/**
 * Calculate word count from text
 */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

/**
 * Calculate maximum words allowed for given duration
 */
export function calculateMaxWords(
  durationSeconds: number,
  wordsPerMinute: number = 150
): number {
  return Math.floor((durationSeconds / 60) * wordsPerMinute);
}

/**
 * Validate dialogue against scene duration constraint
 */
export function validateDialogue(
  dialogue: string,
  maxDuration: number = 8,
  wordsPerMinute: number = 150
): WPMValidation {
  const wordCount = countWords(dialogue);
  const duration = calculateDuration(wordCount, wordsPerMinute);
  const maxWords = calculateMaxWords(maxDuration, wordsPerMinute);
  const isValid = wordCount <= maxWords;

  let warningMessage: string | undefined;

  if (!isValid) {
    const excessWords = wordCount - maxWords;
    warningMessage = `Dialogue is ${excessWords} word${
      excessWords > 1 ? "s" : ""
    } too long. Please reduce to ${maxWords} words or less.`;
  } else if (wordCount > maxWords * 0.9) {
    // Warn when at 90% capacity
    const remainingWords = maxWords - wordCount;
    warningMessage = `Only ${remainingWords} word${
      remainingWords > 1 ? "s" : ""
    } remaining for this ${maxDuration}s scene.`;
  }

  return {
    wordCount,
    duration,
    isValid,
    maxWords,
    warningMessage,
  };
}

/**
 * Split dialogue into multiple scenes if it exceeds max duration
 */
export function splitDialogue(
  dialogue: string,
  maxDuration: number = 8,
  wordsPerMinute: number = 150
): string[] {
  const words = dialogue.trim().split(/\s+/);
  const maxWordsPerScene = calculateMaxWords(maxDuration, wordsPerMinute);
  const scenes: string[] = [];

  for (let i = 0; i < words.length; i += maxWordsPerScene) {
    const sceneWords = words.slice(i, i + maxWordsPerScene);
    scenes.push(sceneWords.join(" "));
  }

  return scenes;
}

/**
 * Format duration as MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Get color class based on validation status
 */
export function getValidationColor(validation: WPMValidation): string {
  if (!validation.isValid) {
    return "text-red-500";
  }
  if (validation.wordCount > validation.maxWords * 0.9) {
    return "text-yellow-500";
  }
  return "text-green-500";
}
