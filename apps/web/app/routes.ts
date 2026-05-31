import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("auth/sign-in", "routes/auth/sign-in.tsx"),
	route("auth/sign-up", "routes/auth/sign-up.tsx"),
	route("app", "routes/app.tsx"),
	route("api/auth/*", "routes/api-auth-proxy.ts"),
] satisfies RouteConfig;
