import type { Metadata } from "next";
import { BugsList } from "@/components/bugs/bugs-list";

export const metadata: Metadata = {
  title: "Bug reports — Cosa Nostra",
};

export default function BugsPage() {
  return <BugsList />;
}
