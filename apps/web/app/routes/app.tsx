import type { FormEvent } from "react"
import { useState } from "react"
import { Link, redirect, useLoaderData, useNavigate } from "react-router"
import type { Route } from "./+types/app"
import { Button } from "@polarnl/polarui-react"
import { authClient } from "../lib/auth-client"
import { getCurrentSession } from "../lib/auth.server"

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Symbiote" },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request)

  if (!session) {
    throw redirect("/auth/sign-in")
  }

  return { session }
}

export default function Workspace() {
  const navigate = useNavigate()
  const { session } = useLoaderData<typeof loader>()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignOut = async (_event: FormEvent<HTMLFormElement>) => {
    _event.preventDefault()
    setError(null)
    setSigningOut(true)

    try {
      const result = await authClient.signOut()

      if (result.error) {
        setError(result.error.message ?? "Could not sign out.")
        return
      }

      navigate("/auth/sign-in", { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.")
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <></>
  )
}
