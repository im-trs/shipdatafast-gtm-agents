import { chat } from "../core/utils/openrouter"

async function main() {
  const res = await chat([
    { role: "user", content: "Say hello like a guerrilla startup agent" }
  ])

  console.log(res)
}

main()
