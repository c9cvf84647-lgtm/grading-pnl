import { fail, json, withUser } from "@/lib/http";
import { estimateFor, getProduct } from "@/lib/pricecharting";

export async function GET(req: Request) {
  return withUser(async () => {
    const p = new URL(req.url).searchParams;
    try {
      const product = await getProduct(p.get("id") || "");
      const { sales: _sales, ...rest } = product;
      const est = estimateFor(product, p.get("company") || "", p.get("grade") || "");
      return json({ product: rest, ...est });
    } catch {
      return fail("Couldn't look up that card's price right now.", 502);
    }
  });
}
