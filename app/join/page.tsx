import { Suspense } from "react";
import { JoinClient } from "./join-client";

function JoinFallback() {
  return (
    <div className="flex min-h-dvh flex-col px-4 pb-8 pt-5">
      <div className="h-10" />
      <div className="mt-10 space-y-4">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-10 w-64 rounded bg-muted" />
        <div className="h-40 rounded-2xl bg-muted/50" />
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<JoinFallback />}>
      <JoinClient />
    </Suspense>
  );
}
