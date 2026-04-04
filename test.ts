import WebSocket from "ws"
import readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

type IncomingEvent =
  | {
    name: "llm.think"
    data: {
      delta: string
      item_id: string
      output_index: number
      content_index: number
    }
  }
  | {
    name: "llm.response"
    data: {
      delta: string
      item_id: string
      output_index: number
    }
  }
  | {
    name: "llm.function_call"
    data: {
      call_id: string
      name: string
      arguments: string
      item_id: string
      output_index: number
      delta?: string
    }
  }
  | {
    name: "function.ok" | "function.error"
    data: Record<string, any>
  }
  | {
    name: "llm.finish"
    data: Record<string, any>
  }
  | {
    name: "llm.error"
    data: { error: unknown }
  }

const rl = readline.createInterface({ input, output })
const ws = new WebSocket("ws://localhost:3000/ws")

let awaitingResponse = false
let turnCompleteResolver: (() => void) | undefined
let answerBuffer = ""
let reasoningStarted = false
let answerStarted = false

const color = {
  reasoning: "\x1b[35m",
  answer: "\x1b[36m",
  tool: "\x1b[33m",
  success: "\x1b[32m",
  error: "\x1b[31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
}

function startTurnView() {
  reasoningStarted = false
  answerStarted = false
  answerBuffer = ""
  console.log("")
}

function ensureReasoningSection() {
  if (reasoningStarted) {
    return
  }

  reasoningStarted = true
  console.log(`${color.reasoning}Reasoning${color.reset}`)
}

function ensureAnswerSection() {
  if (answerStarted) {
    return
  }

  answerStarted = true
  console.log("")
  console.log(`${color.answer}Answer${color.reset}`)
}

function printToolCall(event: Extract<IncomingEvent, { name: "llm.function_call" }>) {
  console.log(`\n${color.tool}🔧 Executing tool:${color.reset} ${event.data.name}`)
  try {
    const parsedArgs = JSON.parse(event.data.arguments)
    console.log(`   args: ${JSON.stringify(parsedArgs, null, 2)}`)
  } catch {
    console.log(`   args: ${event.data.arguments}`)
  }
}

function printToolResult(event: Extract<IncomingEvent, { name: "function.ok" | "function.error" }>) {
  const label = event.name === "function.ok" ? `${color.success}✅ Tool result${color.reset}` : `${color.error}❌ Tool error${color.reset}`
  console.log(`\n${label}:`)
  console.log(JSON.stringify(event.data, null, 2))
}

function sendChatPrompt(content: string) {
  startTurnView()
  awaitingResponse = true

  const turnComplete = new Promise<void>((resolve) => {
    turnCompleteResolver = resolve
  })

  ws.send(JSON.stringify({
    name: "llm.request",
    data: {
      messages: [
        {
          role: "user",
          content,
        },
      ],
    },
  }))

  return turnComplete
}

async function promptLoop() {
  while (true) {
    const answer = await rl.question("\nYou > ")
    const content = answer.trim()

    if (!content) {
      continue
    }

    if (content === "/exit" || content === "/quit") {
      ws.close()
      rl.close()
      process.exit(0)
    }

    if (ws.readyState !== WebSocket.OPEN) {
      console.log("WebSocket is not connected yet.")
      continue
    }

    await sendChatPrompt(content)
  }
}

ws.on("open", () => {
  console.log("Connected to ws://localhost:3000/ws")
  console.log("Type a message and press Enter. Use /exit to quit.")
  void promptLoop()
})

ws.on("message", (data) => {
  let event: IncomingEvent

  try {
    event = JSON.parse(data.toString()) as IncomingEvent
  } catch {
    console.log("Received non-JSON message:", data.toString())
    return
  }

  switch (event.name) {
    case "llm.think":
      ensureReasoningSection()
      process.stdout.write(`${color.dim}${event.data.delta}${color.reset}`)
      break
    case "llm.response":
      ensureAnswerSection()
      answerBuffer += event.data.delta
      process.stdout.write(event.data.delta)
      break
    case "llm.function_call":
      printToolCall(event)
      break
    case "function.ok":
    case "function.error":
      printToolResult(event)
      break
    case "llm.error":
      console.log("\n⚠️ Model error:", event.data.error)
      break
    case "llm.finish":
      answerBuffer = ""
      awaitingResponse = false
      turnCompleteResolver?.()
      turnCompleteResolver = undefined
      console.log("\n")
      break
  }
})

ws.on("error", (error) => {
  console.error("WebSocket Error:", error)
})

ws.on("close", (code, reason) => {
  console.log(`WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`)
  turnCompleteResolver?.()
  turnCompleteResolver = undefined
  rl.close()
  if (awaitingResponse) {
    process.exitCode = 1
  }
})
