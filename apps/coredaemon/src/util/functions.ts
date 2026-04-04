import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { Function } from "@symbiote/types"

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

function getToolExports(moduleExports: Record<string, unknown>): Function[] {
  const tools: Function[] = []

  // Also check if default is an array
  if (Array.isArray(moduleExports.default)) {
    for (const val of moduleExports.default) {
      if (
        val &&
        typeof val === "object" &&
        typeof (val as Function).name === "string" &&
        typeof (val as Function).exec === "function"
      ) {
        tools.push(val as Function)
      }
    }
  }

  for (const value of Object.values(moduleExports)) {
    if (
      value &&
      typeof value === "object" &&
      typeof (value as Function).name === "string" &&
      typeof (value as Function).exec === "function" &&
      !tools.includes(value as Function)
    ) {
      tools.push(value as Function)
    }
  }

  return tools
}

async function runFunction(filePath: string, functionName: string, args: Record<string, any>) {
  const moduleExports = await import(pathToFileURL(filePath).href)
  const tools = getToolExports(moduleExports)
  const tool = tools.find(t => t.name === functionName)

  if (!tool) {
    throw new Error(`Tool ${functionName} not found in ${filePath}`)
  }

  if (!tool.enabled()) {
    throw new Error(`Tool ${functionName} is currently disabled`)
  }

  return tool.exec(args)
}

export async function getFunctions(
  functionsDir: string = defaultFunctionsDir,
): Promise<Function[]> {
  const functions: Function[] = []

  for (const filePath of walkFunctionsDir(functionsDir)) {
    const moduleExports = await import(pathToFileURL(filePath).href)
    const tools = getToolExports(moduleExports)

    for (const tool of tools) {
      if (functions.some((existingFunction) => existingFunction.name === tool.name)) {
        throw new Error(`Duplicate function name: ${tool.name}`)
      }

      if (!tool.enabled()) {
        continue
      }

      const { exec, ...definition } = tool

      functions.push({
        ...definition,
        exec: (args: Record<string, any>) => runFunction(filePath, tool.name, args),
      })
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
  const tool = functions.find((functionDefinition) => functionDefinition.name === name)

  if (!tool) {
    throw new Error(`Function not found: ${name}`)
  }

  return tool.exec(args)
} 