import { currentUser, toPublic } from "@/lib/auth";
import { json } from "@/lib/http";
import { hasDatabase } from "@/lib/store";

export async function GET() {
  const user = await currentUser();
  return json({ user: user ? toPublic(user) : null, database: hasDatabase });
}
