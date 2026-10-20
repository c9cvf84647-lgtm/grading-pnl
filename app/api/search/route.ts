import { fail, json, withUser } from "@/lib/http";
import { searchCards } from "@/lib/pricecharting";

export async function GET(req: Request) {
  return withUser(async () => {
    const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100);
    if (q.length < 2) return json({ results: [] });
    try {
      return json({ results: await searchCards(q) });
    } catch {
      return fail("Card search is unavailable right now.", 502);
    }
  });
}
