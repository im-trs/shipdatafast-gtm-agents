export type ReplyExample = {
  reply_text: string
  outcome: string
}

export type ResearchInput = {
  successes: ReplyExample[]
  failures: ReplyExample[]
}

export type ResearchOutput = {
  new_prompt: string
  reasoning: string
}
