"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ACTION_SLOT_RULES, canUseActionSlot } from "./data";
import { useGame } from "./game-provider";
import { PlayerAvatar } from "./player-avatar";
import { ReadyStatus } from "./ready-status";
import type { Player } from "./types";

type DragData =
  | { type: "player"; playerId: string }
  | { type: "slot"; index: number; playerId: string | null };

const clampToViewport: Modifier = ({ transform, draggingNodeRect }) => {
  if (!draggingNodeRect) return transform;

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  return {
    ...transform,
    x: clamp(
      transform.x,
      -draggingNodeRect.left,
      window.innerWidth - draggingNodeRect.right,
    ),
    y: clamp(
      transform.y,
      -draggingNodeRect.top,
      window.innerHeight - draggingNodeRect.bottom,
    ),
  };
};

function ChipContent({ player }: { player: Player }) {
  return (
    <>
      <PlayerAvatar player={player} className="size-8" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {player.name}
      </span>
    </>
  );
}

function RosterPlayer({
  player,
  selected,
}: {
  player: Player;
  selected: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `player:${player.id}`,
      data: { type: "player", playerId: player.id } satisfies DragData,
    });

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
      }}
      className={cn(
        "flex min-h-12 touch-none items-center gap-2 rounded-xl border bg-card p-2 text-left",
        selected && "border-primary/40 bg-primary/5 opacity-60",
        isDragging && "opacity-40",
      )}
      {...listeners}
      {...attributes}
    >
      <ChipContent player={player} />
      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function SentenceSlot({
  index,
  playerId,
  players,
  invalid,
  onClear,
}: {
  index: number;
  playerId: string | null;
  players: Player[];
  invalid: boolean;
  onClear: () => void;
}) {
  const t = useTranslations("Action");
  const player = playerId
    ? players.find((item) => item.id === playerId)
    : undefined;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `slot:${index}`,
    data: {
      type: "slot",
      index,
      playerId: playerId ?? null,
    } satisfies DragData,
    disabled: invalid,
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `slot:${index}`,
    data: {
      type: "slot",
      index,
      playerId: playerId ?? null,
    } satisfies DragData,
    disabled: !player,
  });

  return (
    <span
      ref={setDropRef}
      aria-label={t("slotAria", { index: index + 1 })}
      className={cn(
        "mx-1 inline-flex min-h-9 min-w-24 items-center justify-center rounded-lg align-middle",
        isOver && "ring-2 ring-ring ring-offset-2 ring-offset-card",
        invalid && "ring-2 ring-faction-mafia ring-offset-2 ring-offset-card",
      )}
    >
      {player ? (
        <button
          ref={setDragRef}
          type="button"
          onClick={onClear}
          style={{
            transform: transform
              ? CSS.Translate.toString(transform)
              : undefined,
          }}
          className={cn(
            "inline-flex touch-none items-center min-h-9 gap-1.5 rounded-lg border bg-secondary px-2.5 py-1 h-full text-sm font-medium w-full",
            isDragging && "opacity-40",
          )}
          {...listeners}
          {...attributes}
        >
          <div className="flex truncate grow">{player.name}</div>
          <GripVertical className="size-3.5 text-muted-foreground" />
        </button>
      ) : (
        <span className="inline-flex min-h-9 items-center rounded-lg border border-dashed px-2.5 text-xs w-full text-muted-foreground">
          {t("dropName")}
        </span>
      )}
    </span>
  );
}

export function ActionPanel() {
  const t = useTranslations("Action");
  const common = useTranslations("Common");
  const {
    state,
    you,
    yourRole,
    alivePlayers,
    submitAction,
    unready,
    isReady,
    waitingCount,
  } = useGame();
  const isNight = state.phase === "night";
  const hasAction = yourRole.abilityPhase === (isNight ? "night" : "day");
  const phaseWord = isNight ? common("night") : common("day");
  const template = t(`sentences.${you.roleId}`, {
    first: "{first}",
    second: "{second}",
  });
  const tokenCount = (template.match(/\{(first|second)\}/g) ?? []).length;
  const [slots, setSlots] = useState<(string | null)[]>(() =>
    Array.from({ length: tokenCount }, () => null),
  );
  const [activeDrag, setActiveDrag] = useState<{
    playerId: string;
    fromSlot: number | null;
  } | null>(null);
  const dragHappened = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  if (!hasAction) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium">
            {t("noAction", { phase: phaseWord })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {yourRole.abilityPhase === "passive"
              ? t("passiveBody")
              : t("noActionBody")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const roster = alivePlayers;
  const activePlayer = activeDrag
    ? alivePlayers.find((player) => player.id === activeDrag.playerId)
    : undefined;
  const slotRules = ACTION_SLOT_RULES[you.roleId] ?? [];
  const ready = slots.every((slot) => slot !== null);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as DragData | undefined;
    if (!data?.playerId) return;

    dragHappened.current = true;
    setActiveDrag({
      playerId: data.playerId,
      fromSlot: data.type === "slot" ? data.index : null,
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    window.setTimeout(() => {
      dragHappened.current = false;
    }, 250);

    const data = event.active.data.current as DragData | undefined;
    if (!data?.playerId || !event.over) return;

    const overId = String(event.over.id);
    if (!overId.startsWith("slot:")) return;

    const destination = Number(overId.slice(5));
    const player = alivePlayers.find((item) => item.id === data.playerId);
    if (!player) return;

    const fromSlot = data.type === "slot" ? data.index : undefined;
    if (
      !canUseActionSlot(
        slotRules[destination],
        player,
        you.id,
        slots,
        destination,
        fromSlot,
      )
    ) {
      return;
    }

    if (
      (data.type === "slot" && data.index === destination) ||
      (data.type === "player" && slots[destination] === data.playerId)
    ) {
      return;
    }

    if (isReady) unready();

    setSlots((current) => {
      const next = current.map((value) =>
        value === data.playerId ? null : value,
      );
      next[destination] = data.playerId;
      return next;
    });
  }

  function handleDragCancel() {
    setActiveDrag(null);
    window.setTimeout(() => {
      dragHappened.current = false;
    }, 250);
  }

  function clearSlot(index: number) {
    if (dragHappened.current) return;
    if (isReady) unready();
    setSlots((current) =>
      current.map((value, slotIndex) => (slotIndex === index ? null : value)),
    );
  }

  const parts = template.split(/(\{first\}|\{second\})/g);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      modifiers={[clampToViewport]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("title")}
            </p>
            <p className="mt-2 text-lg leading-loose">
              {parts.map((part, index) => {
                if (part === "{first}" || part === "{second}") {
                  const slotIndex = parts
                    .slice(0, index)
                    .filter(
                      (item) => item === "{first}" || item === "{second}",
                    ).length;
                  const valid =
                    !activePlayer ||
                    canUseActionSlot(
                      slotRules[slotIndex],
                      activePlayer,
                      you.id,
                      slots,
                      slotIndex,
                      activeDrag?.fromSlot ?? undefined,
                    );

                  return (
                    <SentenceSlot
                      key={index}
                      index={slotIndex}
                      playerId={slots[slotIndex] ?? null}
                      players={alivePlayers}
                      invalid={!!activePlayer && !valid}
                      onClear={() => clearSlot(slotIndex)}
                    />
                  );
                }
                return <span key={index}>{part}</span>;
              })}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("dragHint")}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("rosterTitle")}</p>
          <div className="grid grid-cols-2 gap-2">
            {roster.map((player) => (
              <RosterPlayer
                key={player.id}
                player={player}
                selected={slots.includes(player.id)}
              />
            ))}
          </div>
        </div>

        <Button
          type="button"
          className="h-12 w-full gap-2"
          disabled={!ready || isReady}
          onClick={() => {
            if (!ready) return;
            submitAction(slots.filter((slot): slot is string => !!slot));
          }}
        >
          {isReady ? <Check className="size-4" /> : null}
          {t("confirm")}
        </Button>
        <ReadyStatus show={isReady} waitingCount={waitingCount} />
      </div>

      <DragOverlay>
        {activePlayer ? (
          <div className="flex min-h-12 items-center gap-2 rounded-xl border bg-card p-2 shadow-xl">
            <ChipContent player={activePlayer} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
