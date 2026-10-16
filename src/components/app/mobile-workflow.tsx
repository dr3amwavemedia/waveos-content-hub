import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MobileWorkflowSteps({ steps, step, onChange }: { steps: string[]; step: number; onChange: (step: number) => void }) {
  return <nav aria-label="Workflow steps" className="sm:hidden">
    <div className="flex items-center justify-between gap-2">
      {steps.map((label, index) => <Button key={label} type="button" variant="ghost" size="icon" aria-label={`${index + 1}. ${label}`} aria-current={step === index ? "step" : undefined} onClick={() => onChange(index)} className={cn("h-11 w-11 rounded-full border", step === index ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
        {index < step ? <Check /> : index + 1}
      </Button>)}
    </div>
    <p className="mt-3 text-lg font-semibold">{steps[step]}</p>
  </nav>;
}

export function MobileWorkflowSection({ active, children, className }: { active: boolean; children: ReactNode; className?: string }) {
  return <div className={cn(active ? "block" : "hidden sm:block", className)}>{children}</div>;
}

export function MobileWorkflowFooter({ step, total, onChange, canNext = true, final }: { step: number; total: number; onChange: (step: number) => void; canNext?: boolean; final?: ReactNode }) {
  return <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-border pt-4 sm:hidden">
    <Button type="button" variant="outline" className="min-h-12" disabled={step === 0} onClick={() => onChange(step - 1)}><ArrowLeft /> Back</Button>
    {step < total - 1 ? <Button type="button" className="min-h-12" disabled={!canNext} onClick={() => onChange(step + 1)}>Continue <ArrowRight /></Button> : final}
  </div>;
}