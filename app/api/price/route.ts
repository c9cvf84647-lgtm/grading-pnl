import { fail, json, withUser } from "@/lib/http";
import { getProduct, priceFor } from "@/lib/pricecharting";

export async function GET(req: Request) {
  return withUser(async () => {
    const p = new URL(req.url).searchParams;
    try {
      const product = await getProduct(p.get("id") || "");
      const { label, price } = priceFor(product.prices, p.get("company") || "", p.get("grade") || "");
      return json({ product, label, price });
    } catch {
      return fail("Couldn't look up that card's price right now.", 502);
    }
  });
}
