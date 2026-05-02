import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/_app.tsx", [
    index("routes/home.tsx"),
    route("settings", "routes/settings._index.tsx"),
  ]),
  route("login",  "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
