import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useEffect, useState } from "react";

export function MobileToolPanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const m = window.matchMedia("(max-width: 639px)"); const on = () => setMobile(m.matches); on(); m.addEventListener("change", on); return () => m.removeEventListener("change", on); }, []);
  if (!mobile) return <aside className="space-y-4">{children}</aside>;
  return <Sheet open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
    <SheetContent side="bottom" aria-describedby={undefined} className="max-h-[56dvh] overflow-y-auto rounded-t-3xl border-border-strong bg-surface pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <SheetHeader className="mb-4"><SheetTitle>{title}</SheetTitle></SheetHeader>
      <div className="space-y-4">{children}</div>
    </SheetContent>
  </Sheet>;
}