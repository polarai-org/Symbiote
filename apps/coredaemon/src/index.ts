import Fastify from "fastify"
import websocket from "@fastify/websocket"
import { fromNodeHeaders } from "better-auth/node"
import { createLogger } from "./util/logger.js"
import { getFunctions } from "./util/functions.js"
import { appConfig } from "@symbiote/config"
import { getLLMProvider } from "./util/llm/provider.js"
import { auth } from "./util/auth.js"
import { registerWSRoute } from "./websocket.js"

async function main() {
  const logger = createLogger()
  const fastify = Fastify({ logger: false })

  await fastify.register(websocket)

  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (request, reply) => {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`)

        const response = await auth.handler(new Request(url.toString(), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        }))

        reply.status(response.status)
        response.headers.forEach((value, key) => reply.header(key, value))

        return reply.send(response.body ? await response.text() : null)
      } catch (err) {
        logger.error(`Authentication route failed: ${err instanceof Error ? err.message : String(err)}`)

        return reply.status(500).send({
          code: "AUTH_FAILURE",
          error: "Internal authentication error",
        })
      }
    },
  })

  const functions = await getFunctions()
  // AppConfig is there, the app wil crash if it's not valid, so we can safely assert it with !
  const provider = await getLLMProvider(appConfig!.llm.provider_name, functions).catch((err) => {
    logger.error(`Failed to initialize LLM provider: ${err.message}`)
    process.exit(1)
  })

  registerWSRoute(fastify, {
    functions,
    logger,
    provider,
  })

  if (!functions.length) {
    logger.warn("No available tools found in src/functions")
  }

  const port = appConfig!.coredaemon.port
  const host = appConfig!.coredaemon.host

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
