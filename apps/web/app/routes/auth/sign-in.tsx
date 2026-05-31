import type { FormEvent } from "react"
import { useState } from "react"
import { Link, redirect, useLoaderData, useNavigate } from "react-router"
import type { Route } from "./+types/sign-in"
import { authClient } from "../../lib/auth-client"
import {
  getCurrentSession,
  isSignupEnabled,
} from "../../lib/auth.server"

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Symbiote · Sign in" },
    { name: "description", content: "Sign in to Symbiote" },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request)

  if (session) {
    throw redirect("/app")
  }

  return { allowSignUp: isSignupEnabled() }
}

export default function SignIn() {
  const navigate = useNavigate()
  const { allowSignUp } = useLoaderData<typeof loader>()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      })

      if (result.error) {
        setError(result.error.message ?? "Could not sign in.")
        return
      }

      navigate("/app", { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Symbiote
            </p>
            <h1 className="text-3xl font-semibold">Sign in</h1>
            <p className="text-sm leading-6 text-slate-600">
              Use your account to open the workspace.
            </p>
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Password
              </span>
              <input
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-6 text-sm text-slate-600">
            {allowSignUp ? (
              <p>
                First time here?{" "}
                <Link
                  className="font-medium text-slate-900 underline"
                  to="/auth/sign-up"
                >
                  Create the first account
                </Link>
                .
              </p>
            ) : (
              <p>Account creation is disabled right now.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
