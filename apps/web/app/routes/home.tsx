import { redirect } from "react-router"
import type { Route } from "./+types/home"
import { getCurrentSession } from "../lib/auth.server"

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Symbiote" },
    { name: "description", content: "Sign in to Symbiote" },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request)

  if (session) {
    throw redirect("/app")
  }

  throw redirect("/auth/sign-in")
}

export default function Home() {
  return null
}
