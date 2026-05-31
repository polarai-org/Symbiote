import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("auth/sign-in", "routes/auth/sign-in.tsx"),
	route("auth/sign-up", "routes/auth/sign-up.tsx"),
	route("app", "routes/app.tsx", [
		index("routes/app/index.tsx"),
		route("chat/:chatId", "routes/app/chat.tsx"),
	]),
	route("api/auth/*", "routes/api/auth/[...auth].ts"),
] satisfies RouteConfig;
