// Card search, graded prices and card photos from PriceCharting's public pages.
// PriceCharting also sells an official API; if they start blocking these lookups,
// swap the two fetches below for that API with a token in PRICECHARTING_TOKEN.

const BASE = "https://www.pricecharting.com";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; GradingPnL/1.0)", Accept: "*/*" };

export type SearchHit = { id: string; name: string; number: string; set: string; image: string };
export type Product = SearchHit & { url: string; prices: Record<string, number> };

const cleanSet = (s: string) => s.replace(/^Pokemon\s+/i, "");

// "M Charizard EX #69" -> name "M Charizard EX", number "69"
function splitName(productName: string) {
  const m = productName.match(/^(.*?)\s*#(\S+)\s*$/);
  return m ? { name: m[1], number: m[2] } : { name: productName, number: "" };
}

export async function searchCards(q: string): Promise<SearchHit[]> {
  const url = `${BASE}/search-products?type=prices&format=json&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 3600 } });
  if (!res.ok) throw new Error("search failed: " + res.status);
  const data = (await res.json()) as {
    products?: { id: string; productName: string; consoleName: string; category: string; imageUri?: string }[];
  };
  return (data.products || [])
    .filter((p) => p.category === "pokemon-cards")
    .slice(0, 12)
    .map((p) => ({ id: p.id, ...splitName(p.productName), set: cleanSet(p.consoleName), image: p.imageUri || "" }));
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export async function getProduct(id: string): Promise<Product> {
  if (!/^\d+$/.test(id)) throw new Error("bad id");
  const res = await fetch(`${BASE}/game/${id}`, { headers: HEADERS, next: { revalidate: 3600 } });
  if (!res.ok) throw new Error("product failed: " + res.status);
  const html = await res.text();

  const prices: Record<string, number> = {};
  const table = html.match(/<div id="full-prices">([\s\S]*?)<\/table>/)?.[1] || "";
  for (const m of table.matchAll(/<td>([^<]+)<\/td>\s*<td class="price[^"]*">\s*\$([\d,.]+)/g)) {
    prices[decode(m[1].trim())] = parseFloat(m[2].replace(/,/g, ""));
  }

  const title = decode(table.match(/<h2>Full Price Guide:\s*(.*?)\s*\(([^)]*)\)<\/h2>/)?.[1] || "");
  const set = decode(table.match(/<h2>Full Price Guide:.*\(([^)]*)\)<\/h2>/)?.[1] || "");
  const img = html.match(/https:\/\/storage\.googleapis\.com\/images\.pricecharting\.com\/[^"'\s]+?\/(?:1600|240)\.jpg/)?.[0] || "";

  return {
    id,
    ...splitName(title),
    set: cleanSet(set),
    image: img.replace(/\/1600\.jpg$/, "/240.jpg"),
    url: res.url,
    prices,
  };
}

// Picks the PriceCharting price row that matches a grading company and grade.
// PriceCharting splits 10s by company and lumps every other grade together.
export function priceFor(prices: Record<string, number>, company: string, grade: string): { label: string; price: number | null } {
  let label = "Ungraded";
  if (grade === "Black Label 10") label = "BGS 10 Black";
  else if (grade === "Pristine 10") label = company === "BGS" ? "BGS 10" : "CGC 10 Pristine";
  else if (grade === "10") label = ["PSA", "BGS", "CGC", "SGC", "TAG", "ACE"].includes(company) ? `${company} 10` : "PSA 10";
  else if (grade && grade !== "Authentic") label = `Grade ${grade}`;
  return { label, price: prices[label] ?? null };
}
