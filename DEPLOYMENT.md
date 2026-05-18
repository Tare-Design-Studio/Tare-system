# Deployment & Push Guide

How to push updates to ARCHITECT_OS. Vercel auto-deploys every push to `main`.

## Repo

- GitHub: `git@github.com:Tare-System/Tare-System-Architect-OS.git` (org `Tare-System`, private)
- Remote: `origin` → branch `main`
- Hosting: Vercel project owned by the client's account, Git-linked to this repo

## Auto-deploy

Vercel's Git integration is connected to this repo. **Every `git push` to `main` triggers a
Production deploy automatically** — no manual deploy step. Pushes to any other branch create a
Preview deploy. Production branch in Vercel → Settings → Git must stay set to `main`.

## Before every push

1. **Build must pass locally.** Never push a broken build — it deploys a broken site.
   ```bash
   npm run build
   ```
   The `build` script sets `NODE_OPTIONS=--max-old-space-size=8192` to avoid OOM in the
   type-check phase. Do not remove that.

2. **No secrets in the commit.** `.env`, `.vercel`, `*.pem` are gitignored. Verify nothing
   sensitive is staged:
   ```bash
   git add -A --dry-run | grep -iE 'env|secret|\.pem|service.account' || echo "clean"
   ```

3. **Schema/state docs updated** if the change touched them (per `CLAUDE.md`):
   `SCHEMA.md` on any migration, `PROJECT_STATE.md` after a feature/issue,
   `DEMO_VS_PROD.md` on demo code changes.

## Standard push

Work happens on `main` for this project.

```bash
git add -A
git commit -m "<type>: <description>"
git push origin main
```

Commit message format (`<type>`: feat, fix, refactor, docs, test, chore, perf, ci):

```
feat: add expense approval flow

<optional body explaining why>
```

## Feature-branch push (optional, for review)

```bash
git checkout -b <branch-name>
git add -A
git commit -m "<type>: <description>"
git push -u origin <branch-name>
```

This produces a Vercel **Preview** deploy. Merge to `main` (PR or fast-forward) to ship to
Production.

## Environment variables

App env vars live in the **Vercel dashboard** (Project → Settings → Environment Variables),
not in the repo. Adding or changing a `NEXT_PUBLIC_*` var requires a **redeploy** to take
effect — those values are baked in at build time. Server-only vars take effect on the next
deploy without a rebuild.

Excluded from Vercel: `NODE_ENV` (Vercel sets it), `GOOGLE_PRIVATE_KEY` and
`GOOGLE_SERVICE_ACCOUNT_EMAIL` (unused — Drive uses OAuth refresh-token auth).

## Do not commit

- `.env` / `.env*` — secrets
- `.vercel` — local Vercel link
- `.next/`, `node_modules/`, `*.tsbuildinfo` — build artifacts
- Scratch/dev-only files (see `.gitignore`)

## Post-push check

After pushing to `main`, confirm the deploy in the Vercel dashboard (Deployments tab) goes
green. If it fails, read the build log — a failing local `npm run build` is the most common
cause and should have been caught before the push.
