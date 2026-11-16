import { cn } from "@/lib/utils";

export function WizardProgress({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {steps.map((step, index) => (
          <span
            key={step}
            aria-hidden
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index <= current ? "bg-faction-mafia" : "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-faction-mafia">
          {steps[current]}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {String(current + 1).padStart(2, "0")} /{" "}
          {String(steps.length).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
