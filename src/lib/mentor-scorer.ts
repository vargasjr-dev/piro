/**
 * mentor-scorer.ts
 *
 * Calls an LLM (currently Anthropic) to score N student responses for a given
 * prompt. Returns a 0.0–1.0 reward for each response — these scores feed into
 * GRPO training as the reward signal.
 *
 * Uses Anthropic tool_use to force structured JSON output (no regex parsing).
 */

export interface ScoreResult {
  index: number;
  score: number;       // 0.0 → 1.0
  reasoning: string;   // brief explanation, shown in training UI
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// The tool the model must call — forces structured score output.
const SCORE_TOOL = {
  name: "submit_scores",
  description:
    "Submit evaluation scores for each candidate response. Call this once with all scores.",
  input_schema: {
    type: "object",
    properties: {
      scores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: {
              type: "integer",
              description: "0-indexed position of the response in the input list",
            },
            score: {
              type: "number",
              description:
                "Reward score from 0.0 (poor) to 1.0 (ideal). Most scores land 0.2–0.9.",
            },
            reasoning: {
              type: "string",
              description: "1–2 sentences explaining the score.",
            },
          },
          required: ["index", "score", "reasoning"],
        },
      },
    },
    required: ["scores"],
  },
};

function buildUserMessage(prompt: string, responses: string[]): string {
  const numbered = responses
    .map((r, i) => `### Response ${i + 1}\n${r.trim()}`)
    .join("\n\n");

  return `## Prompt to evaluate responses for\n${prompt.trim()}\n\n## Candidate Responses\n${numbered}`;
}

export async function scoreResponses(opts: {
  model: string;
  temperature: number;
  systemPrompt: string;
  prompt: string;
  responses: string[];
}): Promise<ScoreResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const body = {
    model: opts.model,
    max_tokens: 1024,
    temperature: opts.temperature,
    system: opts.systemPrompt,
    tools: [SCORE_TOOL],
    tool_choice: { type: "tool", name: "submit_scores" },
    messages: [
      {
        role: "user",
        content: buildUserMessage(opts.prompt, opts.responses),
      },
    ],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content: { type: string; name?: string; input?: { scores: ScoreResult[] } }[];
  };

  const toolUse = data.content.find(
    (c) => c.type === "tool_use" && c.name === "submit_scores",
  );
  if (!toolUse?.input?.scores) {
    throw new Error("Mentor returned no scores — unexpected response shape");
  }

  // Clamp scores to [0, 1] defensively
  return toolUse.input.scores.map((s) => ({
    index: s.index,
    score: Math.max(0, Math.min(1, s.score)),
    reasoning: s.reasoning,
  }));
}
