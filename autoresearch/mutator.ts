import { chat } from "../core/utils/openrouter"
import type { ResearchInput, ResearchOutput } from "./types"

export async function generateCandidatePrompt(input: ResearchInput): Promise<ResearchOutput> {
  const successExamples = input.successes.map(s => `- SUCCESS: "${s.reply_text}" → ${s.outcome}`).join("\n")
  const failureExamples = input.failures.map(f => `- FAILURE: "${f.reply_text}" → ${f.outcome}`).join("\n")

  const prompt = `
You are optimizing B2B outreach reply templates.

Analyze these examples and generate an improved prompt template.

SUCCESSFUL REPLIES:
${successExamples}

FAILED/IGNORED REPLIES:
${failureExamples}

Output ONLY valid JSON in this exact format:
{
  "new_prompt": "Your improved prompt template for generating replies",
  "reasoning": "Brief explanation of what patterns you observed"
}

Rules:
- new_prompt must be actionable and specific
- reasoning must identify patterns from successes vs failures
- output ONLY JSON, no markdown, no explanations
`.trim()

  const raw = await chat([
    { role: "system", content: "You optimize B2B outreach prompts based on performance data. Output only JSON." },
    { role: "user", content: prompt },
  ])

  try {
    const parsed = JSON.parse(raw) as ResearchOutput
    return {
      new_prompt: parsed.new_prompt || "",
      reasoning: parsed.reasoning || "",
    }
  } catch {
    return {
      new_prompt: "",
      reasoning: "Failed to parse model output",
    }
  }
}
