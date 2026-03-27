"use client";

import { useEffect, useState } from "react";

const PHONE_LANDSCAPE_QUERY = "(orientation: landscape) and (pointer: coarse) and (max-height: 540px)";

export function PortraitOrientationHint() {
  const [shouldShowHint, setShouldShowHint] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(PHONE_LANDSCAPE_QUERY);
    const updateVisibility = () => {
      setShouldShowHint(mediaQuery.matches);
    };

    updateVisibility();
    mediaQuery.addEventListener("change", updateVisibility);
    window.addEventListener("resize", updateVisibility);

    return () => {
      mediaQuery.removeEventListener("change", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  if (!shouldShowHint) {
    return null;
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[95] md:hidden">
      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-surface-raised px-4 py-3 text-center shadow-[var(--shadow-modal)] backdrop-blur-xl">
        <p className="text-sm font-medium text-foreground">
          For the best experience, please rotate your phone to portrait.
        </p>
      </div>
    </div>
  );
}
