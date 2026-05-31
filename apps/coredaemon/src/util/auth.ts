import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { prisma } from "@symbiote/db"
import { appConfig } from "@symbiote/config"
import { createLogger } from "./logger.js"

function getAuthBaseURL() {
  const { host, port } = appConfig!.coredaemon
  const resolvedHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host

  return `http://${resolvedHost}:${port}`
}

function getSecret() {
  const secret = appConfig!.coredaemon.encryption_secret
  if (!secret) {
    createLogger().warn("No encryption secret found in config. This secret is required for authentication to work. Please set 'coredaemon.encryption_secret' in your config file.")
    process.exit(1)
  }
  return secret
}

export const auth = betterAuth({
  baseURL: getAuthBaseURL(),
  secret: getSecret(),
  trustedOrigins: ["*"],
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: !appConfig!.coredaemon.allow_signup,
  },
})
