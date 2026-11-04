import { useEffect, useState } from "react";

/**
 * Media-query match that is null until the browser has measured the screen,
 * so a page can wait instead of flashing the wrong layout after hydration.
 */
export function useMatchesMedia(query: string) {
  const [matches, setMatches] = useState<boolean | null>(null);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** Campaign Manager phone layout below the existing `sm` desktop breakpoint. */
export const CAMPAIGN_PHONE_QUERY = "(max-width: 639px)";
/** Video Maker mobile editor below the existing `lg` desktop breakpoint. */
export const VIDEO_MAKER_MOBILE_QUERY = "(max-width: 1023px)";
