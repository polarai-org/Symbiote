import type { ChangeEvent, FormEvent } from "react"
import { useState } from "react"
import { Link, redirect, useLoaderData, useNavigate } from "react-router"
import type { Route } from "./+types/sign-in"
import { Button, Input } from "@polarnl/polarui-react"
import { authClient } from "../../lib/auth-client"
import {
  getCurrentSession,
  isSignupEnabled,
} from "../../lib/auth.server"
import {
  ArrowRight,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

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
    <main className="flex min-h-screen items-center justify-center px-6 text-neutral-50">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-sm">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-neutral-400">
            Symbiote
          </p>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-neutral-400">Use your email and password.</p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-neutral-200">Email</span>
            <Input
              scheme="dark"
              icon={<Mail />}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-neutral-200">Password</span>
            <Input
              scheme="dark"
              icon={<Lock />}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? (
            <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
              {error}
            </p>
          ) : null}

          <Button
            color="sky"
            textColor="black"
            className="w-full"
            type="submit"
            disabled={submitting}
            icon={submitting ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </Button>

          {allowSignUp ? (
            <div className="pt-2 text-center text-sm text-neutral-400">
              Don’t have an account?{" "}
              <Link className="text-sky-200 underline-offset-4 hover:underline" to="/auth/sign-up">
                Sign up
              </Link>
            </div>
          ) : null}
        </form>
      </div>
    </main>
  )
}
