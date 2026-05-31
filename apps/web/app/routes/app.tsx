import type { FormEvent } from "react"
import { useState } from "react"
import { Link, redirect, useLoaderData, useNavigate } from "react-router"
import type { Route } from "./+types/app"
import { authClient } from "../lib/auth-client"
import { getCurrentSession } from "../lib/auth.server"

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Symbiote · Workspace" },
    { name: "description", content: "Your Symbiote workspace" },
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
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-2xl items-center">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Symbiote
              </p>
              <h1 className="text-3xl font-semibold">You are signed in</h1>
              <p className="text-sm leading-6 text-slate-600">
                This is the tiniest possible landing page — just enough to prove the
                auth flow works.
              </p>
            </div>

            <form onSubmit={handleSignOut}>
              <button
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                type="submit"
                disabled={signingOut}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </form>
          </div>

          <div className="mt-8 grid gap-4 rounded-3xl bg-slate-50 p-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                Name
              </p>
              <p className="mt-2 text-lg font-medium text-slate-900">
                {session.user.name}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                Email
              </p>
              <p className="mt-2 text-lg font-medium text-slate-900">
                {session.user.email}
              </p>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="mt-6 text-sm text-slate-600">
            Want to start over?{" "}
            <Link className="font-medium text-slate-900 underline" to="/auth/sign-in">
              Back to sign in
            </Link>
            .
          </div>
        </section>
      </div>
    </main>
  )
}
