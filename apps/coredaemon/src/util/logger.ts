import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import winston from "winston"
import { appConfig as config, getConfigDir } from "@symbiote/config"
export function createLogger(): winston.Logger {
  const transports: winston.transport[] = []

  if (config!.logging.console.enabled) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ level, message, timestamp }) => {
            return `${timestamp} [${level}] ${message}`
          }),
        ),
      }),
    )
  }

  if (config!.logging.logfile.enabled) {
    let filename = config!.logging.logfile.path

    if (filename.startsWith("~")) {
      filename = path.join(os.homedir(), filename.slice(1))
    }

    if (!path.isAbsolute(filename)) {
      filename = path.join(getConfigDir(), filename)
    }

    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const yyyy = now.getFullYear()

    filename = filename.replace("${mm-dd-yyyy}", `${mm}-${dd}-${yyyy}`)

    fs.mkdirSync(path.dirname(filename), { recursive: true })

    transports.push(
      new winston.transports.File({
        filename,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    )
  }

  return winston.createLogger({
    level: "info",
    transports,
  })
}
