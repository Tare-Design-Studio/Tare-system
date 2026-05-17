#!/usr/bin/env node
// One-time Google Drive OAuth setup.
//
// Prereq: a Google Cloud OAuth client (type: Desktop app). Put its ID + secret
// in .env as GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET, then run:
//   npx tsx scripts/drive-auth.ts
//
// It opens a consent page in your browser; after you approve, it captures the
// code on a loopback server and prints the long-lived refresh token to add to
// .env as GOOGLE_OAUTH_REFRESH_TOKEN. Run once — the token does not expire.
import "dotenv/config";
import http from "node:http";
import { exec } from "node:child_process";
import {
  makeOAuthClient,
  DRIVE_SCOPES,
  OAUTH_REDIRECT_PORT,
} from "../lib/drive/client";

async function run() {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    console.error(
      "❌ Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env first.\n" +
        "   Create them at: Google Cloud Console → APIs & Services → Credentials\n" +
        "   → Create credentials → OAuth client ID → Application type: Desktop app",
    );
    process.exit(1);
  }

  const oauth = makeOAuthClient();
  const authUrl = oauth.generateAuthUrl({
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // force a refresh token even on re-consent
    scope: DRIVE_SCOPES,
  });

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "", `http://localhost:${OAUTH_REDIRECT_PORT}`);
      const err = url.searchParams.get("error");
      const c = url.searchParams.get("code");
      // Google redirects to the bare loopback origin "/" with ?code=... .
      // Ignore favicon and other stray requests.
      if (!c && !err) {
        res.writeHead(204).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><body style="font-family:system-ui;padding:40px"><h2>${
          c ? "✅ Authorized — you can close this tab." : "❌ Authorization failed."
        }</h2></body></html>`,
      );
      finish();
      if (c) resolve(c);
      else reject(new Error(err ?? "no code returned"));
    });

    // Close the server exactly once, on any exit path, so the port never leaks.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("Timed out after 5 min waiting for consent"));
    }, 5 * 60_000);

    server.on("error", (e: NodeJS.ErrnoException) => {
      finish();
      reject(
        e.code === "EADDRINUSE"
          ? new Error(
              `Port ${OAUTH_REDIRECT_PORT} is in use. Free it with:\n` +
                `   lsof -ti :${OAUTH_REDIRECT_PORT} | xargs kill -9`,
            )
          : e,
      );
    });

    server.listen(OAUTH_REDIRECT_PORT, () => {
      console.log("\n🔑 Opening Google consent page in your browser…");
      console.log("   If it does not open, visit this URL manually:\n");
      console.log("   " + authUrl + "\n");
      exec(`open "${authUrl}"`); // macOS
    });
  });

  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      "❌ No refresh token returned. Revoke the app's access at " +
        "https://myaccount.google.com/permissions and run this script again.",
    );
    process.exit(1);
  }

  console.log("\n✅ Success. Add this line to .env:\n");
  console.log(`GOOGLE_OAUTH_REFRESH_TOKEN="${tokens.refresh_token}"\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
