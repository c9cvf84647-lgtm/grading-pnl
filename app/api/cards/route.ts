import { isPremium } from "@/lib/auth";
import { cleanCard, listCards, saveCard } from "@/lib/cards";
import { body, fail, json, withUser } from "@/lib/http";

export async function GET() {
  return withUser(async (user) => json({ cards: await listCards(user) }));
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    if ((await listCards(user)).length >= 2000) return fail("You've reached the 2,000 card limit.");
    const card = cleanCard(await body(req), isPremium(user));
    await saveCard(user, card);
    return json({ card });
  });
}
