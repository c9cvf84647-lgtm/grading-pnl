import { createUser, normEmail, rateLimited, startSession, toPublic } from "@/lib/auth";
import { seedOwnerCards } from "@/lib/cards";
import { body, fail, json } from "@/lib/http";

export async function POST(req: Request) {
  const b = await body(req);
  const email = normEmail(String(b.email || ""));
  const password = String(b.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return fail("Enter a valid email address.");
  if (password.length < 8) return fail("Use a password of at least 8 characters.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (await rateLimited("signup:" + ip)) return fail("Too many sign-ups from here. Try again in a few minutes.", 429);
  const user = await createUser(email, password);
  if (!user) return fail("An account with that email already exists. Sign in instead.", 409);
  await seedOwnerCards(user);
  await startSession(user);
  return json({ user: toPublic(user) });
}
