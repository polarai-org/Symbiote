import { redirect } from "react-router"
import type { Route } from "./+types/app"
import { getCurrentSession } from "../lib/auth.server"

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Symbiote" },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request)

  if (!session) {
    throw redirect("/auth/sign-in")
  }

  return {}
}

export default function Workspace() {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-background" />
  )
}
