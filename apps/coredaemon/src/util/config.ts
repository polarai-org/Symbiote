import path from "node:path"
import fs from "node:fs"
import { AppConfig } from "@symbiote/types"

export function getConfig() {
  const cwd = process.cwd()
  const configFile = path.join(cwd, "../../config.json")
  const config = JSON.parse(fs.readFileSync(configFile, "utf-8")) as AppConfig
  return config
}

export const appConfig = getConfig()