"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type AutoRefreshProps = {
  /** How often to pull fresh server data, in milliseconds. */
  intervalMs?: number;
};

/**
 * Keeps a server-rendered page current for everyone who has it open.
 *
 * Without this, the page renders once when opened and never changes — so when
 * one person checks a customer in, nobody else's screen shows it until they
 * manually reload. That's the exact problem front desk reported.
 *
 * `router.refresh()` re-runs the server component and swaps in new data while
 * preserving client state, so in-progress form entry is not disturbed.
 *
 * Polling stops while the tab is hidden and resumes (with an immediate refresh)
 * when it becomes visible again, so idle machines cost nothing.
 */
export function AutoRefresh({ intervalMs = 15000 }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;

    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const start = () => {
      stop();
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          router.refresh();
        }
      }, intervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh(); // catch up immediately on return
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router, intervalMs]);

  return null;
}
