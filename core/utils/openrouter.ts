import axios from "axios"
import { ENV } from "./env"

export async function chat(messages: any[]) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: ENV.OPENROUTER_MODEL,
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${ENV.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    )

    return res.data.choices[0].message.content

  } catch (err) {
    console.log("⚠️ Primary model failed, using fallback...")

    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: ENV.OPENROUTER_FALLBACK_MODEL,
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${ENV.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    )

    return res.data.choices[0].message.content
  }
}
