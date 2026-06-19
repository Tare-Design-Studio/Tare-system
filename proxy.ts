import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths EXCEPT:
     * - _next/static, _next/image — build assets
     * - api/public — anon-accessible API
     * - sw.js, manifest.webmanifest — PWA files (must never be auth-redirected)
     * - any file with an extension (icons, images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|api/public/|sw\\.js|manifest\\.webmanifest|.*\\.[\\w]+$).*)",
  ],
};
