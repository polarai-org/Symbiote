import path from "node:path"
import { createLogger } from "./util/logger.js"
import fs from "node:fs"
import { AppConfig } from "@symbiote/types"

async function main() {
  const cwd = process.cwd()
  const configFile = path.join(cwd, "../../config.json")
  const config = JSON.parse(fs.readFileSync(configFile, "utf-8")) as AppConfig

  const logger = createLogger()

  logger.info("Hello from Symbiote core daemon")
}

await main().catch((err) => {
  console.error(err)
  process.exit(1)
})