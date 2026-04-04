import Fastify, { FastifyRequest } from "fastify"
import websocket, { WebSocket } from "@fastify/websocket"
import { createLogger } from "./util/logger.js"
import { executeFunction, getFunctions } from "./util/functions.js"
import { appConfig } from "./util/config.js"
import { Event, ChatMessage } from "@symbiote/types"
import { getLLMProvider } from "./util/llm/provider.js"

async function main() {
  const logger = createLogger()
  const fastify = Fastify({ logger: false })

  await fastify.register(websocket)

  const functions = await getFunctions()
  const provider = await getLLMProvider(appConfig.llm.provider_name, functions).catch((err) => {
    logger.error(`Failed to initialize LLM provider: ${err.message}`)
    process.exit(1)
  })

  fastify.get("/ws", { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const conversation: ChatMessage[] = []

    const sendModelResponse = async (): Promise<void> => {
      while (true) {
        let sawToolCall = false
        let finalFinishEvent: Event | undefined
        let assistantBuffer = ""

        for await (const event of provider.processChatCompletion(conversation)) {
          if (event.name === "llm.function_call") {
            socket.send(JSON.stringify(event))
            sawToolCall = true

            try {
              const args = JSON.parse(event.data.arguments)
              const functionResult = await executeFunction(event.data.name, args)
              socket.send(JSON.stringify(functionResult))

              conversation.push({
                type: "function_call_output",
                call_id: event.data.call_id,
                output: JSON.stringify(functionResult),
              })
            } catch (err) {
              logger.error(`Error executing function ${event.data.name}: ${err}`)

              const functionError = {
                name: "function.error" as const,
                data: {
                  error: err instanceof Error ? err.message : String(err),
                  name: event.data.name,
                },
              }

              socket.send(JSON.stringify(functionError))

              conversation.push({
                type: "function_call_output",
                call_id: event.data.call_id,
                output: JSON.stringify(functionError),
              })
            }
            continue
          }

          if (event.name === "llm.finish") {
            finalFinishEvent = event
            continue
          }

          if (event.name === "llm.response") {
            assistantBuffer += event.data.delta
          }
          socket.send(JSON.stringify(event))
        }

        if (sawToolCall) {
          continue
        }

        if (assistantBuffer) {
          conversation.push({
            role: "assistant",
            content: assistantBuffer,
          })
        }

        if (finalFinishEvent) {
          socket.send(JSON.stringify(finalFinishEvent))
        }
        return
      }
    }

    socket.on('message', message => {
      let parsedPayload: Event;
      try {
        parsedPayload = JSON.parse(message.toString())
        if (parsedPayload.name === "llm.request") {
          if (parsedPayload.data.messages && Array.isArray(parsedPayload.data.messages)) {
            for (const message of parsedPayload.data.messages) {
              conversation.push(message)
            }
            (async () => {
              try {
                await sendModelResponse()
              } catch (err) {
                logger.error(`Error processing chat completion: ${err}`)
                socket.send(JSON.stringify({
                  name: "symbiote.error",
                  data: {
                    error: "Error processing chat completion"
                  }
                }))
              }
            })()
          }
        }
      } catch (error) {
        socket.send(JSON.stringify({
          type: "symbiote.error",
          data: {
            error: "Invalid JSON payload"
          }
        }))
        return
      }
    })
  })

  if (!Object.keys(functions).length) {
    logger.warn("No available tools found in src/functions")
  }

  const port = appConfig.coredaemon.port
  const host = appConfig.coredaemon.host

  await fastify.listen({
    host,
    port,
  })

  logger.info(`Symbiote CoreDaemon is running on ws://${host}:${port}/ws`)

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`)
    await fastify.close()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

await main().catch((err) => {
  console.error(err)
  process.exit(1)
})