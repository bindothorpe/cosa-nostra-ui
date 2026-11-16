"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function IdentityFields({
  name,
  onNameChange,
  allowComplexRoles,
  onAllowComplexRolesChange,
  nameError,
  idPrefix = "identity",
  className,
}: {
  name: string;
  onNameChange: (name: string) => void;
  allowComplexRoles: boolean;
  onAllowComplexRolesChange: (allowed: boolean) => void;
  nameError?: string | null;
  idPrefix?: string;
  className?: string;
}) {
  const t = useTranslations("Identity");
  const nameId = `${idPrefix}-name`;
  const complexId = `${idPrefix}-complex`;

  return (
    <div className={cn("space-y-5", className)}>
      <div className="space-y-2">
        <Label htmlFor={nameId}>{t("name")}</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={t("namePlaceholder")}
          className="h-12 rounded-xl bg-background/60 text-base"
          autoComplete="nickname"
          maxLength={20}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
        />
        {nameError ? (
          <p id={`${nameId}-error`} className="text-xs text-destructive">
            {nameError}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          "flex items-start justify-between gap-4 rounded-xl border bg-muted/30 p-4",
          allowComplexRoles && "border-faction-mafia/25 bg-faction-mafia/5",
        )}
      >
        <div className="min-w-0 space-y-1">
          <Label htmlFor={complexId}>{t("roleLabel")}</Label>
          <p
            id={`${complexId}-hint`}
            className="text-xs leading-relaxed text-muted-foreground"
          >
            {t("roleHint")}
          </p>
        </div>
        <Switch
          id={complexId}
          checked={allowComplexRoles}
          onCheckedChange={onAllowComplexRolesChange}
          aria-describedby={`${complexId}-hint`}
          className="mt-0.5 shrink-0"
        />
      </div>
    </div>
  );
}
