import { useRef, type ReactNode } from "react";

export function GallerySwipeSurface({
  children,
  onPrevious,
  onNext,
}: {
  children: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      onTouchStart={(event) => {
        if (
          event.touches.length !== 1 ||
          (event.target instanceof Element &&
            event.target.closest("video,audio,button,a,input,select,textarea"))
        ) {
          start.current = null;
          return;
        }
        start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }}
      onTouchCancel={() => {
        start.current = null;
      }}
      onTouchEnd={(event) => {
        const origin = start.current;
        start.current = null;
        if (!origin || !event.changedTouches.length || event.touches.length) return;
        const dx = event.changedTouches[0].clientX - origin.x,
          dy = event.changedTouches[0].clientY - origin.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) onNext();
        else onPrevious();
      }}
    >
      {children}
    </div>
  );
}
