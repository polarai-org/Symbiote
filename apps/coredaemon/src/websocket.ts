import type { FastifyInstance } from "fastify"
import type { FastifyReply, FastifyRequest } from "fastify"
import type { WebSocket } from "@fastify/websocket"
import type { ChatMessage, Conversation, ConversationSummary, Event, Function as SymbioteFunction } from "@symbiote/types"
import { prisma } from "@symbiote/db"
import { fromNodeHeaders } from "better-auth/node"
import { randomUUID } from "node:crypto"
import { auth } from "./util/auth.js"
import type { LLMProvider } from "./util/llm/provider.js"
import type { Logger } from "winston"

async function getSession(request: FastifyRequest) {
  return auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  })
}

async function authenticateUpgrade(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = await getSession(request)

  if (!session) {
    reply.code(401).send({
      error: "Unauthorized",
    })
  }
}

type ConversationStore = {
  ensureConversation: (userId: string, conversationId: string) => Promise<void>
  listConversations: (userId: string) => Promise<ConversationSummary[]>
  getConversation: (userId: string, conversationId: string) => Promise<Conversation | null>
  loadMessages: (userId: string, conversationId: string) => Promise<ChatMessage[]>
  appendMessages: (userId: string, conversationId: string, messages: ChatMessage[]) => Promise<void>
}

type IncomingWebsocketEvent =
  | { name: "conversation.switch"; data: { id: string } }
  | { name: "conversation.fetch"; data: { id: string } }
  | { name: "conversations.list"; data?: undefined }
  | { name: "llm.request"; data: { messages: ChatMessage[] } }

function parseStoredMessage(payload: string): ChatMessage {
  return JSON.parse(payload) as ChatMessage
}

function serializeConversationSummary(conversation: {
  id: string
  title: string | null
  createdAt: Date
  updatedAt: Date
}): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title || "Untitled chat",
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  }
}

function createTitleFromMessages(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => {
    return "role" in message && message.role === "user" && message.content.trim().length > 0
  })

  if (!firstUserMessage || !("role" in firstUserMessage)) {
    return null
  }

  const compactTitle = firstUserMessage.content.trim().replace(/\s+/g, " ")
  return compactTitle.length > 48 ? `${compactTitle.slice(0, 45)}...` : compactTitle
}

const prismaConversationStore: ConversationStore = {
  async ensureConversation(userId, conversationId) {
    await prisma.conversation.upsert({
      where: {
        userId_id: {
          userId,
          id: conversationId,
        },
      },
      create: {
        id: conversationId,
        userId,
        platform: "web",
      },
      update: {},
    })
  },

  async listConversations(userId) {
    const conversations = await prisma.conversation.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return conversations.map(serializeConversationSummary)
  },

  async getConversation(userId, conversationId) {
    const conversation = await prisma.conversation.findUnique({
      where: {
        userId_id: {
          userId,
          id: conversationId,
        },
      },
      include: {
        messages: {
          orderBy: {
            index: "asc",
          },
        },
      },
    })

    if (!conversation) {
      return null
    }

    return {
      ...serializeConversationSummary(conversation),
      messages: conversation.messages.map((message) => parseStoredMessage(message.payload)),
    }
  },

  async loadMessages(userId, conversationId) {
    const messages = await prisma.message.findMany({
      where: {
        userId,
        conversationId,
      },
      orderBy: {
        index: "asc",
      },
    })

    return messages.map((message) => parseStoredMessage(message.payload))
  },

  async appendMessages(userId, conversationId, messages) {
    if (!messages.length) {
      return
    }

    await prisma.$transaction(async (tx) => {
      const conversationRecord = await tx.conversation.findUniqueOrThrow({
        where: {
          userId_id: {
            userId,
            id: conversationId,
          },
        },
        select: {
          title: true,
        },
      })

      const latestMessage = await tx.message.findFirst({
        where: {
          userId,
          conversationId,
        },
        orderBy: {
          index: "desc",
        },
        select: {
          index: true,
        },
      })
      const nextIndex = (latestMessage?.index ?? -1) + 1

      await tx.message.createMany({
        data: messages.map((message, offset) => ({
          id: randomUUID(),
          userId,
          conversationId,
          index: nextIndex + offset,
          payload: JSON.stringify(message),
        })),
      })

      const title = conversationRecord.title ? null : createTitleFromMessages(messages)

      await tx.conversation.update({
        where: {
          userId_id: {
            userId,
            id: conversationId,
          },
        },
        data: {
          ...(title ? { title } : {}),
          updatedAt: new Date(),
        },
      })
    })
  },
}

function sendError(socket: WebSocket, error: string) {
  socket.send(JSON.stringify({
    name: "symbiote.error",
    data: {
      error,
    },
  } satisfies Extract<Event, { name: "symbiote.error" }>))
}

function isChatMessage(message: unknown): message is ChatMessage {
  if (!message || typeof message !== "object") {
    return false
  }

  if ((message as { type?: unknown }).type === "function_call_output") {
    return (
      typeof (message as { call_id?: unknown }).call_id === "string" &&
      typeof (message as { output?: unknown }).output === "string"
    )
  }

  const role = (message as { role?: unknown }).role
  return (
    (role === "system" || role === "developer" || role === "user" || role === "assistant") &&
    typeof (message as { content?: unknown }).content === "string"
  )
}

function isIncomingWebsocketEvent(payload: unknown): payload is IncomingWebsocketEvent {
  if (!payload || typeof payload !== "object" || typeof (payload as { name?: unknown }).name !== "string") {
    return false
  }

  const event = payload as { name: string; data?: unknown }
  if (event.name === "conversation.switch" || event.name === "conversation.fetch") {
    return !!event.data && typeof (event.data as { id?: unknown }).id === "string"
  }

  if (event.name === "conversations.list") {
    return true
  }

  if (event.name === "llm.request") {
    return (
      !!event.data &&
      Array.isArray((event.data as { messages?: unknown }).messages) &&
      (event.data as { messages: unknown[] }).messages.every(isChatMessage)
    )
  }

  return false
}

async function handleFunctionCall(
  socket: WebSocket,
  logger: Logger,
  functions: SymbioteFunction[],
  conversation: ChatMessage[],
  appendMessages: (messages: ChatMessage[]) => Promise<void>,
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
    const outputMessage: ChatMessage = {
      type: "function_call_output",
      call_id: event.data.call_id,
      output: JSON.stringify(errorEvent),
    }
    conversation.push(outputMessage)
    await appendMessages([outputMessage])
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
    const outputMessage: ChatMessage = {
      type: "function_call_output",
      call_id: event.data.call_id,
      output: JSON.stringify(functionResult),
    }
    conversation.push(outputMessage)
    await appendMessages([outputMessage])
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
    const outputMessage: ChatMessage = {
      type: "function_call_output",
      call_id: event.data.call_id,
      output: JSON.stringify(errorEvent),
    }
    conversation.push(outputMessage)
    await appendMessages([outputMessage])
  }

  return "handled_locally"
}

async function sendModelResponse(
  socket: WebSocket,
  logger: Logger,
  provider: LLMProvider,
  functions: SymbioteFunction[],
  conversation: ChatMessage[],
  appendMessages: (messages: ChatMessage[]) => Promise<void>,
): Promise<"complete" | "awaiting_client_function"> {
  while (true) {
    let sawLocalToolCall = false
    let finalFinishEvent: Event | undefined
    let assistantBuffer = ""
    let reasoningBuffer = ""

    for await (const event of provider.processChatCompletion(conversation)) {
      if (event.name === "llm.function_call") {
        const result = await handleFunctionCall(socket, logger, functions, conversation, appendMessages, event)

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

      if (event.name === "llm.think") {
        reasoningBuffer += event.data.delta
      }

      socket.send(JSON.stringify(event))
    }

    if (sawLocalToolCall) {
      continue
    }

    if (assistantBuffer || reasoningBuffer) {
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: assistantBuffer,
        ...(reasoningBuffer ? { reasoning: reasoningBuffer } : {}),
      }
      conversation.push(assistantMessage)
      await appendMessages([assistantMessage])
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
    conversationStore = prismaConversationStore,
    getUserId,
  }: {
    functions: SymbioteFunction[]
    logger: Logger
    provider: LLMProvider
    authenticateUpgrade?: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void
    conversationStore?: ConversationStore
    getUserId?: (request: FastifyRequest) => Promise<string | null> | string | null
  },
): void {
  fastify.get("/ws", { websocket: true, preValidation: customAuthenticateUpgrade ?? authenticateUpgrade }, (socket, request) => {
    let activeConversationId: string | null = null
    let activeResponse = false

    socket.on("message", (message) => {
      void (async () => {
        let userId: string | null

        if (getUserId) {
          userId = await getUserId(request)
        } else {
          const session = await getSession(request)
          userId = session?.user.id ?? null
        }

        if (!userId) {
          sendError(socket, "Unauthorized")
          return
        }

        let parsedPayload: unknown

      try {
          parsedPayload = JSON.parse(message?.toString() ?? "")
        } catch {
          sendError(socket, "Invalid JSON payload")
          return
        }

        if (!isIncomingWebsocketEvent(parsedPayload)) {
          sendError(socket, "Invalid websocket payload")
          return
        }

        if (parsedPayload.name === "conversations.list") {
          const conversations = await conversationStore.listConversations(userId)
          socket.send(JSON.stringify({
            name: "conversations.list",
            data: {
              conversations,
            },
          } satisfies Extract<Event, { name: "conversations.list" }>))
          return
        }

        if (parsedPayload.name === "conversation.fetch") {
          const conversation = await conversationStore.getConversation(userId, parsedPayload.data.id)

          if (!conversation) {
            sendError(socket, "Conversation not found")
            return
          }

          socket.send(JSON.stringify({
            name: "conversation.fetch",
            data: {
              id: conversation.id,
              conversation,
            },
          } satisfies Extract<Event, { name: "conversation.fetch" }>))
          return
        }

        if (parsedPayload.name === "conversation.switch") {
          if (activeResponse) {
            sendError(socket, "Cannot switch conversations while a response is in progress")
            return
          }

          await conversationStore.ensureConversation(userId, parsedPayload.data.id)
          activeConversationId = parsedPayload.data.id
          return
        }

        const llmRequest = parsedPayload

        if (activeResponse) {
          sendError(socket, "A response is already in progress")
          return
        }

        if (!activeConversationId) {
          sendError(socket, "No active conversation. Send conversation.switch before llm.request")
          return
        }

        activeResponse = true

        try {
          const conversation = await conversationStore.loadMessages(userId, activeConversationId)
          await conversationStore.appendMessages(userId, activeConversationId, llmRequest.data.messages)
          conversation.push(...llmRequest.data.messages)
          await sendModelResponse(socket, logger, provider, functions, conversation, (messages) => {
            if (!activeConversationId) {
              throw new Error("No active conversation")
            }

            return conversationStore.appendMessages(userId, activeConversationId, messages)
          })
          const conversations = await conversationStore.listConversations(userId)
          socket.send(JSON.stringify({
            name: "conversations.list",
            data: {
              conversations,
            },
          } satisfies Extract<Event, { name: "conversations.list" }>))
        } catch (err) {
          logger.error(`Error processing chat completion: ${err}`)
          sendError(socket, "Error processing chat completion")
        } finally {
          activeResponse = false
        }
      })().catch((err) => {
        logger.error(`Error processing websocket message: ${err}`)
        sendError(socket, "Error processing websocket message")
      })
    })
  })
}

export const registerWebsocketRoute = registerWSRoute
