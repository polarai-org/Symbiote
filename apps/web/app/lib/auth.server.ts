import { appConfig } from "@symbiote/config"
import type { authClient } from "./auth-client"

export function isSignupEnabled() {
	return appConfig?.coredaemon.allow_signup ?? false
}

// export function getCoreDaemonOrigin() {
//   const { host, port } = appConfig!.coredaemon
//   return `http://${host}:${port}`
// }

// export function getCoreDaemonPublicOrigin() {
//   const publicUrl = appConfig!.coredaemon.public_url?.trim()

//   if (publicUrl) {
//     return publicUrl
//   }

//   return getCoreDaemonOrigin()
// }

export function getCoreDaemonAuthBaseURL() {
  return `${appConfig!.coredaemon.public_url?.trim()}/api/auth`
}

export async function getCurrentSession(
  request: Request,
): Promise<typeof authClient.$Infer.Session | null> {
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

    return (await response.json()) as typeof authClient.$Infer.Session | null
  } catch {
    return null
  }
}

export async function proxyAuthRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const targetPath = url.pathname.replace(/^\/api\/auth/, "/api/auth")
  const targetURL = new URL(`${targetPath}${url.search}`, appConfig!.coredaemon.public_url?.trim())

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
