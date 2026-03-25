export type LeadScore = {
  painScore: number
  urgencyScore: number
  fitScore: number
}

const painKeywords = [
  "reconciliation",
  "mismatch",
  "compare csv",
  "compare files",
  "manual process",
  "excel hell",
  "data quality",
  "broken pipeline",
  "audit",
  "failed report",
  "matching rows",
  "duplicate records",
]

const urgencyKeywords = [
  "urgent",
  "asap",
  "hours",
  "days",
  "manual",
  "deadline",
  "every month",
  "every day",
  "painful",
  "wasting time",
]

const fitKeywords = [
  "finance",
  "operations",
  "etl",
  "reporting",
  "insurance",
  "csv",
  "files",
  "data ops",
  "analyst",
  "reconcile",
]

function keywordScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  let hits = 0

  for (const keyword of keywords) {
    if (lower.includes(keyword)) hits += 1
  }

  return Math.min(1, hits / 4)
}

export function scoreLead(text: string): LeadScore {
  return {
    painScore: Number(keywordScore(text, painKeywords).toFixed(4)),
    urgencyScore: Number(keywordScore(text, urgencyKeywords).toFixed(4)),
    fitScore: Number(keywordScore(text, fitKeywords).toFixed(4)),
  }
}
