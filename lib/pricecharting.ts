// Card search, graded prices and card photos from PriceCharting's public pages.
// PriceCharting also sells an official API; if they start blocking these lookups,
// swap the two fetches below for that API with a token in PRICECHARTING_TOKEN.

const BASE = "https://www.pricecharting.com";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; GradingPnL/1.0)", Accept: "*/*" };

export type SearchHit = { id: string; name: string; number: string; set: string; image: string };
export type Sale = { date: string; price: number; title: string };
export type Product = SearchHit & { url: string; prices: Record<string, number>; sales: Record<string, Sale[]> };

const cleanSet = (s: string) => s.replace(/^Pokemon\s+/i, "");

// "M Charizard EX #69" -> name "M Charizard EX", number "69"
function splitName(productName: string) {
  const m = productName.match(/^(.*?)\s*#(\S+)\s*$/);
  return m ? { name: m[1], number: m[2] } : { name: productName, number: "" };
}

type RawHit = { id: string; productName: string; consoleName: string; image: string };

const toHit = (p: RawHit): SearchHit => ({ id: p.id, ...splitName(p.productName), set: cleanSet(p.consoleName), image: p.image });

// PriceCharting's JSON search, with the regular HTML results page as a fallback
// in case the JSON endpoint refuses requests from the hosting provider.
export async function searchCards(q: string): Promise<SearchHit[]> {
  const path = `${BASE}/search-products?type=prices&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(path + "&format=json", { headers: HEADERS, cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const data = (await res.json()) as {
      products?: { id: string; productName: string; consoleName: string; category: string; imageUri?: string }[];
    };
    const hits = (data.products || [])
      .filter((p) => p.category === "pokemon-cards")
      .slice(0, 12)
      .map((p) => toHit({ ...p, image: p.imageUri || "" }));
    if (hits.length) return hits;
    throw new Error("no results");
  } catch (e) {
    console.error("PriceCharting JSON search failed, trying HTML:", (e as Error).message);
  }

  const res = await fetch(path, { headers: { ...HEADERS, Accept: "text/html" }, cache: "no-store" });
  if (!res.ok) throw new Error("search failed: " + res.status);
  const html = await res.text();

  // A single exact match redirects straight to that card's page
  if (/\/game\//.test(res.url) && html.includes('id="full-prices"')) {
    const id = html.match(/data-product-id="(\d+)"/)?.[1] || html.match(/id="product_id"[^>]*value="(\d+)"/)?.[1];
    if (!id) return [];
    const { id: pid, name, number, set, image } = await getProduct(id);
    return [{ id: pid, name, number, set, image }];
  }

  const hits: SearchHit[] = [];
  for (const row of html.split('<tr id="product-').slice(1)) {
    const id = row.match(/^(\d+)/)?.[1];
    const href = row.match(/href="https:\/\/www\.pricecharting\.com\/game\/(pokemon-[^"/]*)\//)?.[1];
    const title = row.match(/<td class="title">\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/)?.[1];
    const set = row.match(/<td class="console[^"]*">\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/)?.[1];
    if (!id || !href || !title) continue;
    const img = row.match(/src="(https:\/\/storage\.googleapis\.com\/images\.pricecharting\.com\/[^"]+?)\/60\.jpg"/)?.[1];
    hits.push(toHit({ id, productName: decode(title), consoleName: decode(set || ""), image: img ? img + "/240.jpg" : "" }));
    if (hits.length >= 12) break;
  }
  return hits;
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

  const sales = parseSales(html);

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
    sales,
  };
}

// The product page lists recent eBay sold listings in one tab per grade. A dropdown maps
// each tab's class (e.g. "completed-auctions-grade-three") to its grade ("Grade 3 (4)").
function parseSales(html: string): Record<string, Sale[]> {
  const tabLabel: Record<string, string> = {};
  for (const m of html.matchAll(/<option value="(completed-auctions-[\w-]+)">\s*([^<(]+?)\s*\(\d+\)/g)) {
    tabLabel[m[1]] = decode(m[2]).replace(/^CGC 10 Prist\.?$/, "CGC 10 Pristine");
  }
  const out: Record<string, Sale[]> = {};
  const tabs = [...html.matchAll(/<div class="(completed-auctions-[\w-]+)"[^>]*>/g)];
  tabs.forEach((m, i) => {
    const label = tabLabel[m[1]];
    if (!label) return;
    // An empty tab has no table, so stop at the next tab as well as at the table's end
    const start = (m.index ?? 0) + m[0].length;
    const rest = html.slice(start, tabs[i + 1]?.index ?? html.length);
    const end = rest.indexOf("</table>");
    const tbody = end < 0 ? "" : rest.slice(0, end);
    const sales: Sale[] = [];
    for (const row of tbody.split("<tr ").slice(1)) {
      const date = row.match(/<td class="date">\s*(\d{4}-\d{2}-\d{2})/)?.[1];
      const price = row.match(/class="js-price"\s*>\s*\$([\d,.]+)/)?.[1];
      const title = row.match(/js-ebay-completed-sale"[^>]*>\s*([^<]+?)\s*<\/a>/)?.[1] || "";
      if (date && price) sales.push({ date, price: parseFloat(price.replace(/,/g, "")), title: decode(title) });
    }
    out[label] = sales.sort((a, b) => b.date.localeCompare(a.date));
  });
  return out;
}

// Picks the PriceCharting price row that matches a grading company and grade.
// PriceCharting splits 10s by company and lumps every other grade together.
export function priceFor(prices: Record<string, number>, company: string, grade: string): { label: string; price: number | null } {
  const label = labelFor(company, grade);
  return { label, price: prices[label] ?? null };
}

function labelFor(company: string, grade: string) {
  let label = "Ungraded";
  if (grade === "Black Label 10") label = "BGS 10 Black";
  else if (grade === "Pristine 10") label = company === "BGS" ? "BGS 10" : "CGC 10 Pristine";
  else if (grade === "10") label = ["PSA", "BGS", "CGC", "SGC", "TAG", "ACE"].includes(company) ? `${company} 10` : "PSA 10";
  else if (grade && grade !== "Authentic") label = `Grade ${grade}`;
  return label;
}

export type Estimate = {
  label: string; // shown under the price, e.g. "PSA 3 recent sales" or "Grade 3 guide"
  price: number | null;
  guide: number | null; // PriceCharting's own price guide figure
  lastSale: { price: number; date: string } | null;
};

const DAY = 86_400_000;
const HALF_LIFE_DAYS = 60; // a sale two months old counts half as much as one today
const MAX_AGE_DAYS = 183; // about 6 months; older sales are ignored for the estimate
const MAX_SALES = 5;

// Sales whose title names this exact company and grade, e.g. "PSA 3" but not "PSA 3.5" or "CGC 3".
function sameSlab(sales: Sale[], company: string, grade: string) {
  if (!company || company === "Other" || !/^\d+(\.5)?$/.test(grade)) return [];
  const g = grade.replace(".", "\\.");
  const re = new RegExp(`\\b${company}\\b[^\\d]{0,20}?${g}(?![\\d.]*\\d)`, "i");
  return sales.filter((s) => re.test(s.title));
}

// Recency weighted median: each sale's weight halves every HALF_LIFE_DAYS. The median keeps
// one odd sale (a mislabeled listing, a best offer) from dragging the value around.
export function recentValue(sales: Sale[], now = Date.now()): number | null {
  const recent = sales
    .map((s) => ({ ...s, age: Math.max(0, (now - Date.parse(s.date + "T00:00:00Z")) / DAY) }))
    .filter((s) => isFinite(s.age) && s.age <= MAX_AGE_DAYS && s.price > 0)
    .sort((a, b) => a.age - b.age)
    .slice(0, MAX_SALES);
  if (!recent.length) return null;
  const weighted = recent.map((s) => ({ price: s.price, w: Math.pow(0.5, s.age / HALF_LIFE_DAYS) })).sort((a, b) => a.price - b.price);
  const total = weighted.reduce((t, s) => t + s.w, 0);
  let acc = 0;
  for (const s of weighted) {
    acc += s.w;
    if (acc >= total / 2) return Math.round(s.price * 100) / 100;
  }
  return weighted[weighted.length - 1].price;
}

// Market value for a slab: recent sold listings when there are any in the last 6 months,
// otherwise PriceCharting's price guide. PriceCharting's guide for thin grades can lag
// far behind the market (one old cheap sale keeps it low for months).
export function estimateFor(p: Pick<Product, "prices" | "sales">, company: string, grade: string, now = Date.now()): Estimate {
  const label = labelFor(company, grade);
  const guide = p.prices[label] ?? null;
  // PriceCharting has no tab for most half grades (a PSA 3.5 sells under "Grade 3"),
  // so look in the whole grade's tab and keep only listings naming the exact slab.
  const half = !p.sales?.[label] && /^\d\.5$/.test(grade) ? p.sales?.[`Grade ${grade.split(".")[0]}`] : undefined;
  const tab = half || p.sales?.[label] || [];
  const exact = sameSlab(tab, company, grade);
  if (half && !exact.length) return { label, price: guide, guide, lastSale: null };
  const pool = exact.length ? exact : tab;
  const last = pool[0] ? { price: pool[0].price, date: pool[0].date } : null;
  const recent = recentValue(pool, now);
  if (recent !== null) {
    const who = exact.length ? `${company} ${grade}` : label;
    return { label: `${who} recent sales`, price: recent, guide, lastSale: last };
  }
  return { label: guide === null ? label : `${label} guide`, price: guide, guide, lastSale: last };
}
