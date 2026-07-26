import { randomInt } from "node:crypto";
import { getCurrentPiroArchitecture } from "~/lib/latest-architecture";


function randomWord(exclude?: string) {
  let word = MODEL_ID_WORDS[randomInt(MODEL_ID_WORDS.length)];
  while (word === exclude)
    word = MODEL_ID_WORDS[randomInt(MODEL_ID_WORDS.length)];
  return word;
}

export function createSuggestedModelId() {
  const architecture = getCurrentPiroArchitecture()
    .architecture.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const safeArchitecture = architecture.startsWith("piro")
    ? "latest"
    : architecture || "latest";
  const firstWord = randomWord();
  return `${safeArchitecture}-${firstWord}-${randomWord(firstWord)}`;
}
