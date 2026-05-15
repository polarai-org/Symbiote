import type { FastifyInstance } from "fastify"
import type { FastifyReply, FastifyRequest } from "fastify"
import type { WebSocket } from "@fastify/websocket"
import type { ChatMessage, Event, Function as SymbioteFunction } from "@symbiote/types"
import { fromNodeHeaders } from "better-auth/node"
import { auth } from "./util/auth.js"
import type { LLMProvider } from "./util/llm/provider.js"
import type { Logger } from "winston"

async function authenticateUpgrade(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  })

  if (!session) {
    reply.code(401).send({
      error: "Unauthorized",
    })
  }
}

async function handleFunctionCall(
  socket: WebSocket,
  logger: Logger,
  functions: SymbioteFunction[],
  conversation: ChatMessage[],
  event: Extract<Event, { name: "llm.function_call" }>,
): Promise<"handled_locally" | "forwarded_to_client"> {
  socket.send(JSON.stringify(event))

  let args: Record<string, any>
  try {
    args = JSON.parse(event.data.arguments)
  } catch (err) {
    logger.error(`Error parsing function arguments for ${event.data.name}: ${err}`)

    const errorEvent: Event = {
      name: "function.error",
      data: {
        error: err instanceof Error ? err.message : String(err),
        name: event.data.name,
      },
    }

    socket.send(JSON.stringify(errorEvent))
    conversation.push({
      type: "function_call_output",
      call_id: event.data.call_id,
      output: JSON.stringify(errorEvent),
    })
    return "handled_locally"
  }

  const localFunction = functions.find((functionDefinition) => functionDefinition.name === event.data.name)
  const forwardedEvent: Event = {
    name: "llm.client_function_call",
    data: {
      name: event.data.name,
      arguments: args,
      call_id: event.data.call_id,
    },
  }

  if (!localFunction) {
    logger.warn(`Function ${event.data.name} is not registered on the server; forwarding to client`)
    socket.send(JSON.stringify(forwardedEvent))
    return "forwarded_to_client"
  }

  try {
    const functionResult = await localFunction.exec(args)
    socket.send(JSON.stringify(functionResult))
    conversation.push({
      type: "function_call_output",
      call_id: event.data.call_id,
      output: JSON.stringify(functionResult),
    })
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.startsWith("Function not found:") || err.message.includes("currently disabled"))
    ) {
      logger.warn(`Function ${event.data.name} is not available on the server; forwarding to client`)
      socket.send(JSON.stringify(forwardedEvent))
      return "forwarded_to_client"
    }

    logger.error(`Error executing function ${event.data.name}: ${err}`)

    const errorEvent: Event = {
      name: "function.error",
      data: {
        error: err instanceof Error ? err.message : String(err),
        name: event.data.name,
      },
    }

    socket.send(JSON.stringify(errorEvent))
    conversation.push({
      type: "function_call_output",
      call_id: event.data.call_id,
      output: JSON.stringify(errorEvent),
    })
  }

  return "handled_locally"
}

async function sendModelResponse(
  socket: WebSocket,
  logger: Logger,
  provider: LLMProvider,
  functions: SymbioteFunction[],
  conversation: ChatMessage[],
): Promise<"complete" | "awaiting_client_function"> {
  while (true) {
    let sawLocalToolCall = false
    let finalFinishEvent: Event | undefined
    let assistantBuffer = ""

    for await (const event of provider.processChatCompletion(conversation)) {
      if (event.name === "llm.function_call") {
        const result = await handleFunctionCall(socket, logger, functions, conversation, event)

        if (result === "forwarded_to_client") {
          return "awaiting_client_function"
        }

        sawLocalToolCall = true
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

    if (sawLocalToolCall) {
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

    return "complete"
  }
}

export function registerWSRoute(
  fastify: FastifyInstance,
  {
    functions,
    logger,
    provider,
    authenticateUpgrade: customAuthenticateUpgrade,
  }: {
    functions: SymbioteFunction[]
    logger: Logger
    provider: LLMProvider
    authenticateUpgrade?: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void
  },
): void {
  fastify.get("/ws", { websocket: true, preValidation: customAuthenticateUpgrade ?? authenticateUpgrade }, (socket) => {
    const conversation: ChatMessage[] = []
    let activeResponse = false

    socket.on("message", (message) => {
      try {
        const parsedPayload = JSON.parse(message?.toString() ?? "")

        if (
          !parsedPayload ||
          parsedPayload.name !== "llm.request" ||
          !parsedPayload.data ||
          !Array.isArray(parsedPayload.data.messages)
        ) {
          throw new Error("Invalid llm.request payload")
        }

        const request = parsedPayload as Extract<Event, { name: "llm.request" }>

        if (activeResponse) {
          socket.send(JSON.stringify({
            name: "symbiote.error",
            data: {
              error: "A response is already in progress",
            },
          }))
          return
        }

        activeResponse = true
        conversation.push(...request.data.messages)

        void (async () => {
          try {
            await sendModelResponse(socket, logger, provider, functions, conversation)
          } catch (err) {
            logger.error(`Error processing chat completion: ${err}`)
            socket.send(JSON.stringify({
              name: "symbiote.error",
              data: {
                error: "Error processing chat completion",
              },
            }))
          } finally {
            activeResponse = false
          }
        })()
      } catch {
        socket.send(JSON.stringify({
          name: "symbiote.error",
          data: {
            error: "Invalid JSON payload",
          },
        }))
        return
      }
    })
  })
}

export const registerWebsocketRoute = registerWSRoute