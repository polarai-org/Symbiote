import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parse } from "jsonc-parser"
import type { AppConfig } from "@symbiote/types"
import { baseConfig } from "./baseConfig.js"

export function getConfigFilePath() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA as string, ".symbiote", "config.jsonc")
  }

  return path.join(os.homedir(), ".symbiote", "config.jsonc")
}

export function getConfigDir() {
  return path.dirname(getConfigFilePath())
}

export function parseConfig(configContent: string): AppConfig {
  return parse(configContent) as AppConfig
}

export function getConfig(): AppConfig {
  const configFile = getConfigFilePath()

  try {
    return parseConfig(fs.readFileSync(configFile, "utf-8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`Config file not found at ${configFile}. We have created a template for you. Please fill it out and restart the application.`)
      fs.mkdirSync(path.dirname(configFile), { recursive: true })
      fs.writeFileSync(configFile, baseConfig, "utf-8")
      process.exit(1)
    }

    throw error
  }
}

export function getSqliteUrl(config = getConfig()) {
  const dbPath = config.coredaemon?.db_path ?? "symbiote.db"
  const absoluteDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(getConfigDir(), dbPath)

  return `file:${absoluteDbPath.replace(/\\/g, "/")}`
}

export const appConfig = getConfig()
