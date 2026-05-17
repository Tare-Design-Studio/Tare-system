"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current Date, but only after the component has mounted on the
 * client. During server render and the first client render it returns `null`.
 *
 * Why: calling `new Date()` directly inside a client component's render makes
 * the server HTML (server clock/timezone) differ from the first client render
 * (device clock/timezone). React then aborts hydration for the whole tree —
 * every onClick handler silently stops working. Gating the date behind a
 * post-mount state update keeps the first render identical on both sides.
 *
 * Callers must handle the `null` first-render case (render a placeholder).
 */
export function useClientNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);
  return now;
}
