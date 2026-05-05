import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/_app.tsx", [
    index("routes/_app._index.tsx"),
    route("settings",                "routes/_app.settings._index.tsx"),
    route("settings/preferences",   "routes/_app.settings.preferences.tsx"),
    route("settings/snapshots",     "routes/_app.settings.snapshots.tsx"),
    route("accounts",           "routes/_app.accounts._index.tsx"),
    route("accounts/new",       "routes/_app.accounts.new.tsx"),
    route("accounts/:id",       "routes/_app.accounts.$id.tsx"),
    route("transactions",             "routes/_app.transactions._index.tsx"),
    route("transactions/new",         "routes/_app.transactions.new.tsx"),
    route("transactions/:id",         "routes/_app.transactions.$id.tsx"),
    route("reports/balance-sheet",    "routes/_app.reports.balance-sheet.tsx"),
    route("reports/income",           "routes/_app.reports.income.tsx"),
    route("reports/net-worth",        "routes/_app.reports.net-worth.tsx"),
    route("reports/spending",         "routes/_app.reports.spending.tsx"),
    route("reports/securities",       "routes/_app.reports.securities.tsx"),
  ]),
  route("login",  "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
