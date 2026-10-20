import { listCards, refreshPrice, saveCard } from "@/lib/cards";
import { json, withUser } from "@/lib/http";

export const maxDuration = 60;

// Re-checks the market price of every card that came from the card search
export async function POST() {
  return withUser(async (user) => {
    const cards = await listCards(user);
    const out = [];
    for (let i = 0; i < cards.length; i += 5) {
      const batch = await Promise.all(cards.slice(i, i + 5).map(refreshPrice));
      await Promise.all(batch.map((c) => saveCard(user, c)));
      out.push(...batch);
    }
    return json({ cards: out });
  });
}
