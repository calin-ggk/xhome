# Localisation

All user-visible dates, amounts, and month labels must go through `useFormat()` (`app/hooks/useFormat.ts`). Never call `toLocaleString` / `toLocaleDateString` with a hardcoded locale string.

## Hook API

| Function | Input | Output |
|---|---|---|
| `fmtAmount(cents, dp?)` | cent integer, optional decimal places (default 2) | localised number string |
| `fmtDate(isoDate)` | `YYYY-MM-DD` | short localised date (e.g. "Apr 15, 2025") |
| `fmtMonth(ym)` | `YYYY-MM` | short month+year (e.g. "Apr 2025") — use for chart labels |
| `fmtMonthLong(ym)` | `YYYY-MM` | long month+year (e.g. "April 2025") — use for headings |
| `fmtShortMonth(ym)` | `YYYY-MM` | abbreviated month only (e.g. "Apr") — use for chart x-axes |
| `locale` | — | raw BCP-47 tag (e.g. `'en-US'`) |

Use `locale` directly when passing a formatter to Recharts — tooltip callbacks receive a pre-divided decimal value, not cents, so `fmtAmount` does not apply there.

## Pure helpers

The underlying functions live in `app/lib/format.ts` and accept an explicit `locale` string. Use them outside React (e.g. tests). `langToLocale(lang)` maps i18n language codes to BCP-47 tags (`en → en-US`, `ro → ro-RO`).

## Form inputs

Do **not** localise form input values. `parseFloat` only handles `.` as decimal separator; localising edit fields would break form submission.
