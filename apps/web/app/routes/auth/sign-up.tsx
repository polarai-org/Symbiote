import type { ChangeEvent, FormEvent } from "react"
import { useState } from "react"
import { Link, redirect, useNavigate } from "react-router"
import type { Route } from "./+types/sign-up"
import { Button, Input } from "@polarnl/polarui-react"
import { authClient } from "../../lib/auth-client"
import { getCurrentSession, isSignupEnabled } from "../../lib/auth.server"
import { ArrowRight, Loader2, Lock, Mail, User } from "lucide-react"

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
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-neutral-50">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-sm">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-neutral-400">
            Symbiote
          </p>
          <h1 className="text-2xl font-semibold">Create account</h1>
          <p className="text-sm text-neutral-400">Enter a name, email, and password.</p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-neutral-200">Name</span>
            <Input
              scheme="dark"
              icon={<User />}
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
              required
            />
          </label>

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
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
              required
              minLength={8}
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
            {submitting ? "Creating account…" : "Create account"}
          </Button>

          <div className="pt-2 text-center text-sm text-neutral-400">
            Already have an account?{" "}
            <Link className="text-sky-200 underline-offset-4 hover:underline" to="/auth/sign-in">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}
