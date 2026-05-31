import type { FormEvent } from "react"
import { useState } from "react"
import { Link, redirect, useNavigate } from "react-router"
import type { Route } from "./+types/sign-up"
import { authClient } from "../../lib/auth-client"
import { getCurrentSession, isSignupEnabled } from "../../lib/auth.server"

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Symbiote · Create account" },
    { name: "description", content: "Create the first Symbiote account" },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request)

  if (session) {
    throw redirect("/app")
  }

  if (!isSignupEnabled()) {
    throw redirect("/auth/sign-in")
  }

  return null
}

export default function SignUp() {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      })

      if (result.error) {
        setError(result.error.message ?? "Could not create the account.")
        return
      }

      navigate("/app", { replace: true })
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the account.",
      )
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
            <h1 className="text-3xl font-semibold">Create the first account</h1>
            <p className="text-sm leading-6 text-slate-600">
              Pick a name, email, and password to unlock the workspace.
            </p>
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Name</span>
              <input
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                type="text"
                autoComplete="name"
                placeholder="Ada Lovelace"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>

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
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
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
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-6 text-sm text-slate-600">
            <p>
              Already set up?{" "}
              <Link
                className="font-medium text-slate-900 underline"
                to="/auth/sign-in"
              >
                Back to sign in
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
