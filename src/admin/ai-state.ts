import van from "vanjs-core";

// Shared AI model selection state (used by both app.ts and creative.ts)
export const selectedProvider = van.state("");
export const selectedModel = van.state("");

export function getSelectedAiModel(): { provider: string; model: string } {
  return { provider: selectedProvider.val, model: selectedModel.val };
}
