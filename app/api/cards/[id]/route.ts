import { isPremium } from "@/lib/auth";
import { cleanCard, deleteCard, getCard, saveCard } from "@/lib/cards";
import { body, fail, json, withUser } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return withUser(async (user) => {
    const prev = await getCard(user, (await ctx.params).id);
    if (!prev) return fail("Card not found.", 404);
    const card = cleanCard(await body(req), isPremium(user), prev);
    await saveCard(user, card);
    return json({ card });
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return withUser(async (user) => {
    await deleteCard(user, (await ctx.params).id);
    return json({ ok: true });
  });
}
