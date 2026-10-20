import { checkPassword, normEmail, rateLimited, startSession, toPublic } from "@/lib/auth";
import { body, fail, json } from "@/lib/http";

export async function POST(req: Request) {
  const b = await body(req);
  const email = normEmail(String(b.email || ""));
  if (await rateLimited("login:" + email)) return fail("Too many attempts. Try again in a few minutes.", 429);
  const user = await checkPassword(email, String(b.password || ""));
  if (!user) return fail("That email and password don't match.", 401);
  await startSession(user);
  return json({ user: toPublic(user) });
}
