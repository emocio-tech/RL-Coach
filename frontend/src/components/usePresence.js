import { useEffect, useState } from "react";

// Keeps a popup mounted for `exitMs` after `open` turns false so its closing animation can play.
// Returns whether to render it and the `data-state` ("open" | "closed") to put on it.
export const DROPDOWN_EXIT_MS = 140;

export default function usePresence(open, exitMs = DROPDOWN_EXIT_MS) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted: open || mounted, state: open ? "open" : "closed" };
}
