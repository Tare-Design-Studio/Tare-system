import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function updateSession(request: NextRequest) {
  // Forward the pathname to server components — layouts can't read it otherwise,
  // and the app shell uses it to drop owner chrome on the site-engineer dashboard.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  // Drop any client-supplied x-user-id. These headers are copied from the
  // inbound request, so without this an anonymous caller could send
  // `x-user-id: <someone-else>` and have it forwarded downstream verbatim —
  // it is only overwritten below when a session exists. Consumers treat this
  // header as middleware-issued, so it must never carry attacker input.
  requestHeaders.delete("x-user-id");

  // Generate the audit correlation id up front and forward it DOWNSTREAM on the
  // request headers (not just the response) so route handlers / server components
  // can read it via headers() and hand it to PostgREST — otherwise the audit
  // trigger's request.headers->>'x-request-id' is always null on authed writes.
  const requestId = uuidv4();
  requestHeaders.set("x-request-id", requestId);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required for SSR session maintenance
  const { data: { user } } = await supabase.auth.getUser();

  // Forward the user id DOWNSTREAM on the request headers, the same way
  // x-request-id is forwarded above — NextResponse.next() snapshots the headers
  // it is given, so the response must be rebuilt after setting it. Without the
  // rebuild, withRouteErrorLog's req.headers.get("x-user-id") is always null and
  // every server-thrown error lands in app_errors with no user attached.
  if (user) {
    requestHeaders.set("x-user-id", user.id);
    const rebuilt = NextResponse.next({ request: { headers: requestHeaders } });
    supabaseResponse.cookies.getAll().forEach((cookie) => rebuilt.cookies.set(cookie));
    supabaseResponse = rebuilt;
  }

  // Echo audit headers on the response too (useful for client-side correlation)
  supabaseResponse.headers.set("x-request-id", requestId);
  if (user) {
    supabaseResponse.headers.set("x-user-id", user.id);
  }

  // Route protection
  const path = request.nextUrl.pathname;
  const isApiPath = path.startsWith("/api/");
  const isPublicPath = path.startsWith("/enquire/") || path.startsWith("/c/");
  // Auth paths: accessible without login; logged-in users redirected away from /login only
  const isLoginPath = path === "/login" || path.startsWith("/login/");
  const isAuthConfirmPath = path === "/auth/confirm";
  const isAuthPath = isLoginPath || path === "/accept" || isAuthConfirmPath;

  // API routes handle their own auth — don't redirect, let them return proper JSON errors
  if (!isApiPath && !user && !isPublicPath && !isAuthPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Redirect already-authenticated users away from /login (but not /accept — they need it)
  if (user && isLoginPath) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}
