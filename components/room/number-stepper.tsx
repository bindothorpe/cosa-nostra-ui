import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NumberStepper({
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
  className,
  valueClassName,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 rounded-full border-border/80 bg-background/60"
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus />
      </Button>
      <span
        aria-live="polite"
        className={cn(
          "min-w-11 text-center font-mono text-2xl font-semibold tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 rounded-full border-border/80 bg-background/60"
        aria-label={increaseLabel}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus />
      </Button>
    </div>
  );
}
