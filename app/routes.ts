import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/_app.tsx", [
    index("routes/_app._index.tsx"),
    route("settings",           "routes/_app.settings._index.tsx"),
    route("settings/snapshots", "routes/_app.settings.snapshots.tsx"),
    route("accounts",           "routes/_app.accounts._index.tsx"),
    route("accounts/new",       "routes/_app.accounts.new.tsx"),
    route("accounts/:id",       "routes/_app.accounts.$id.tsx"),
    route("transactions",       "routes/_app.transactions._index.tsx"),
    route("transactions/new",   "routes/_app.transactions.new.tsx"),
    route("transactions/:id",   "routes/_app.transactions.$id.tsx"),
  ]),
  route("login",  "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
