"use client";

import { useContext } from "react";
import { RoomContext, type RoomContextValue } from "./room-provider";

export function useRoom(): RoomContextValue {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error("useRoom must be used inside RoomProvider");
  }
  return context;
}
