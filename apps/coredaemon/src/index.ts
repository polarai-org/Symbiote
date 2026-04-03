import Fastify from "fastify"
import websocket from "@fastify/websocket"
import { createLogger } from "./util/logger.js"
import { getFunctions } from "./util/functions.js"
import { appConfig } from "./util/llm/config.js"

async function main() {
  const logger = createLogger()
  const fastify = Fastify({ logger: false })

  await fastify.register(websocket)

  fastify.get("/ws", { websocket: true }, () => { /* wip */ })

  const functions = await getFunctions()

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
}

await main().catch((err) => {
  console.error(err)
  process.exit(1)
})