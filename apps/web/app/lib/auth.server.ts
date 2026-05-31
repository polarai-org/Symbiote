import { appConfig } from "@symbiote/config"

export type AuthSession = {
  session: Record<string, unknown>
  user: {
    id: string
    name: string
    email: string
    image?: string | null
  }
}

function resolveCoreDaemonHost(host: string) {
  if (host === "0.0.0.0" || host === "::") {
    return "127.0.0.1"
  }

  return host
}

export function getCoreDaemonOrigin() {
  const { host, port } = appConfig!.coredaemon
  return `http://${resolveCoreDaemonHost(host)}:${port}`
}

export function getCoreDaemonAuthBaseURL() {
  return `${getCoreDaemonOrigin()}/api/auth`
}

export function isSignupEnabled() {
  return appConfig!.coredaemon.allow_signups
}

export async function getCurrentSession(
  request: Request,
): Promise<AuthSession | null> {
  try {
    const headers = new Headers(request.headers)
    headers.delete("host")
    headers.delete("content-length")

    const response = await fetch(`${getCoreDaemonAuthBaseURL()}/get-session`, {
      method: "GET",
      headers,
      redirect: "manual",
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as AuthSession | null
  } catch {
    return null
  }
}

export async function proxyAuthRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const targetPath = url.pathname.replace(/^\/api\/auth/, "/api/auth")
  const targetURL = new URL(`${targetPath}${url.search}`, getCoreDaemonOrigin())

  const headers = new Headers(request.headers)
  headers.delete("host")
  headers.delete("content-length")

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer()
  }

  const response = await fetch(targetURL, init)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
