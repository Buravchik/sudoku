# AGENTS.md

## Cursor Cloud specific instructions

This is a Next.js 15 Sudoku game designed as a Telegram Mini App. It is a fully static client-side application (no backend/database).

### Services

| Service | Command | Notes |
|---------|---------|-------|
| Next.js Dev Server | `npm run dev` | Runs on port 3000. The app renders client-side only (uses `next/dynamic` with `ssr: false`), so SSR bailout messages in the terminal are expected and not errors. |

### Key commands

- **Lint:** `npm run lint`
- **Build:** `npm run build` (note: prebuild hook bumps version via `npm version patch`)
- **Dev:** `npm run dev`

### Caveats

- The app uses `next/dynamic` with SSR disabled. The dev server will show "Bail out to client-side rendering" messages — this is expected behavior, not an error.
- Puzzle data is fetched at runtime from the external API `sudoku-guru.com`. No local backend or database is needed.
- The Telegram bot (`src/telegram/bot.ts`) requires a `TELEGRAM_BOT_TOKEN` environment variable and is optional for development.
- The `prebuild` script in `package.json` runs `npm version patch --no-git-tag-version` before every build, which modifies `package.json`. This is intentional for the CI pipeline but may produce an unwanted diff locally.
- There are no automated tests configured in this project.
