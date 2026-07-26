import { randomInt } from "node:crypto";
import { getCurrentPiroArchitecture } from "~/lib/latest-architecture";

const RANDOM_WORDS = [
  "badger",
  "canyon",
  "cedar",
  "comet",
  "dawn",
  "dune",
  "falcon",
  "flint",
  "forest",
  "harbor",
  "meadow",
  "orbit",
  "pelican",
  "quartz",
  "raven",
  "river",
  "solar",
  "summit",
  "tundra",
  "willow",
] as const;

function randomWord(exclude?: string) {
  let word = RANDOM_WORDS[randomInt(RANDOM_WORDS.length)];
  while (word === exclude) word = RANDOM_WORDS[randomInt(RANDOM_WORDS.length)];
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
