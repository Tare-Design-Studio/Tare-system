# Deployment & Push Guide

How to push updates to ARCHITECT_OS. The code is mirrored to two GitHub repos;
Vercel auto-deploys from the client repo on every push to `main`.

## Repos & remotes

This project pushes to **two** GitHub remotes:

| Remote   | URL                                                  | Role                          |
| -------- | ---------------------------------------------------- | ----------------------------- |
| `org`    | `git@github.com:Tare-System/Tare-System-Architect-OS.git` | Internal tracking copy   |
| `client` | `git@github.com:Tare-Design-Studio/Tare-system.git`  | **Vercel deploys from this**  |

Both track branch `main`. The `org` remote is for keeping our own record; Vercel
only watches `client`.

> Why two: Vercel's free (Hobby) plan only deploys repos owned by a personal
> GitHub account. `Tare-Design-Studio` is the client's personal account, so
> Vercel deploys it free. The `Tare-System` org repo would need Vercel Pro.

## Auto-deploy

The Vercel GitHub App is installed on `Tare-Design-Studio/Tare-system`. **Every
push to `main` on the `client` remote triggers a Production deploy** — no manual
step. Pushes to other branches create Preview deploys. Production branch in
Vercel → Settings → Git must stay set to `main`.

## Before every push

1. **Build must pass locally.** Never push a broken build — it deploys a broken site.
   ```bash
   npm run build
   ```
   The `build` script sets `NODE_OPTIONS=--max-old-space-size=8192` to avoid OOM
   in the type-check phase. Do not remove that.

2. **No secrets in the commit.** `.env`, `.vercel`, `*.pem` are gitignored. Verify
   nothing sensitive is staged:
   ```bash
   git add -A --dry-run | grep -iE 'env|secret|\.pem|service.account' || echo "clean"
   ```

3. **Schema/state docs updated** if the change touched them (per `CLAUDE.md`):
   `SCHEMA.md` on any migration, `PROJECT_STATE.md` after a feature/issue,
   `DEMO_VS_PROD.md` on demo code changes.

## Standard push (ships to production)

Work happens on `main` for this project. Push to **both** remotes with the
`push-all` alias:

```bash
git add -A
git commit -m "<type>: <description>"
git push-all
```

`git push-all` is a git alias defined as:
```
!git push org main && git push client main
```
It pushes to `org` first, then `client`. The push to `client` is what triggers
the Vercel deploy.

To push to only one remote: `git push org main` or `git push client main`.

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
git push client <branch-name>
```

Pushing a branch to `client` produces a Vercel **Preview** deploy. Merge to
`main` and `git push-all` to ship to Production. Mirror the branch to `org` too
if you want it tracked there.

## One-time setup (already done — for reference)

Configuring a fresh clone to match this workflow:

```bash
git remote rename origin org                      # if cloned from the org repo
git remote add client git@github.com:Tare-Design-Studio/Tare-system.git
git config alias.push-all '!git push org main && git push client main'
```

Vercel side (client does this once, on their personal Vercel account):
1. Vercel → Add New → Project → import `Tare-Design-Studio/Tare-system`.
2. If the repo isn't listed → **Adjust GitHub App Permissions** → install the
   Vercel GitHub App on `Tare-Design-Studio`, granting access to `Tare-system`.
3. Framework auto-detects Next.js; build command `npm run build`.
4. Add environment variables (below), deploy.

## Environment variables

App env vars live in the **Vercel dashboard** (Project → Settings → Environment
Variables), not in the repo. Adding or changing a `NEXT_PUBLIC_*` var requires a
**redeploy** to take effect — those values are baked in at build time.
Server-only vars take effect on the next deploy without a rebuild.

`NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` must be set to the assigned
`*.vercel.app` production URL (known only after the first deploy), then redeploy.

Excluded from Vercel: `NODE_ENV` (Vercel sets it), `GOOGLE_PRIVATE_KEY` and
`GOOGLE_SERVICE_ACCOUNT_EMAIL` (unused — Drive uses OAuth refresh-token auth).

After changing the production URL, update **Supabase Auth** Site URL + Redirect
URLs to match, or login breaks in production.

## Do not commit

- `.env` / `.env*` — secrets
- `.vercel` — local Vercel link
- `.next/`, `node_modules/`, `*.tsbuildinfo` — build artifacts
- `supabase/.temp/` — Supabase CLI cache
- Scratch/dev-only files (see `.gitignore`)

## Post-push check

After `git push-all`, confirm the deploy in the Vercel dashboard (Deployments
tab) goes green. If it fails, read the build log — a failing local
`npm run build` is the most common cause and should have been caught before the
push.
