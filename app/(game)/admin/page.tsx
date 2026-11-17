import { notFound } from "next/navigation";
import AdminContent from "./admin-content";

const IS_LIVE = process.env.NEXT_PUBLIC_GAME_MODE === "live";

/**
 * Admin controls exist only in mock mode; in live mode the server owns room
 * state, so the route is a 404.
 */
export default function AdminPage() {
  if (IS_LIVE) notFound();
  return <AdminContent />;
}
