import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { Function as ToolFunction } from "@symbiote/types"

const defaultFunctionsDir = path.join(process.cwd(), "src/functions")

function walkFunctionsDir(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return []
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...walkFunctionsDir(fullPath))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (!/\.(ts|js|mjs|cjs)$/i.test(entry.name)) {
      continue
    }

    files.push(fullPath)
  }

  return files
}

function getToolExport(moduleExports: Record<string, unknown>): ToolFunction | null {
  const preferredExports = [moduleExports.default, moduleExports.tool]

  for (const value of preferredExports) {
    if (
      value &&
      typeof value === "object" &&
      typeof (value as ToolFunction).name === "string" &&
      typeof (value as ToolFunction).exec === "function"
    ) {
      return value as ToolFunction
    }
  }

  for (const value of Object.values(moduleExports)) {
    if (
      value &&
      typeof value === "object" &&
      typeof (value as ToolFunction).name === "string" &&
      typeof (value as ToolFunction).exec === "function"
    ) {
      return value as ToolFunction
    }
  }

  return null
}

async function runFunction(filePath: string, args: Record<string, any>) {
  const moduleExports = await import(pathToFileURL(filePath).href)
  const tool = getToolExport(moduleExports)

  if (!tool) {
    throw new Error(`No tool export found in ${filePath}`)
  }

  return tool.exec(args)
}

export async function getFunctions(
  functionsDir: string = defaultFunctionsDir,
): Promise<Record<string, ToolFunction>> {
  const functions: Record<string, ToolFunction> = {}

  for (const filePath of walkFunctionsDir(functionsDir)) {
    const moduleExports = await import(pathToFileURL(filePath).href)
    const tool = getToolExport(moduleExports)

    if (!tool) {
      continue
    }

    if (functions[tool.name]) {
      throw new Error(`Duplicate function name: ${tool.name}`)
    }

    const { exec, ...definition } = tool

    functions[tool.name] = {
      ...definition,
      exec: (args) => runFunction(filePath, args),
    }
  }

  return functions
}

export async function executeFunction(
  name: string,
  args: Record<string, any>,
  functionsDir: string = defaultFunctionsDir,
) {
  const functions = await getFunctions(functionsDir)
  const tool = functions[name]

  if (!tool) {
    throw new Error(`Function not found: ${name}`)
  }

  return tool.exec(args)
} 