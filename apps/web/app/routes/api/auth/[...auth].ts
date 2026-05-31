import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import { proxyAuthRequest } from "../../../lib/auth.server"

export async function loader({ request }: LoaderFunctionArgs) {
  return proxyAuthRequest(request)
}

export async function action({ request }: ActionFunctionArgs) {
  return proxyAuthRequest(request)
}
