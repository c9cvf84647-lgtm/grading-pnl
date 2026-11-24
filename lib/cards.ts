import { randomUUID } from "node:crypto";
import seed from "@/data/seed-cards.json";
import { ownerEmails, type User } from "./auth";
import { estimateFor, getProduct } from "./pricecharting";
import { store } from "./store";

export type Card = {
  id: string;
  pcId: string;
  name: string;
  number: string;
  set: string;
  image: string;
  cost: number;
  grading: number;
  company: string;
  grade: string;
  market: number;
  priceLabel: string;
  priceUpdatedAt: number;
  lastSale: { price: number; date: string } | null;
  exit: number | null;
  createdAt: number;
  updatedAt: number;
};

export const COMPANIES = ["PSA", "BGS", "CGC", "SGC", "TAG", "ACE", "Other"];

const key = (user: User) => "cards:" + user.id;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};
const lastSaleOf = (v: unknown): Card["lastSale"] => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const date = str(o.date, 10);
  const price = money(o.price);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && price > 0 ? { price, date } : null;
};
const imageUrl = (v: unknown) => {
  const s = str(v, 500);
  return s.startsWith("https://storage.googleapis.com/images.pricecharting.com/") ? s : "";
};

// Builds a clean card from untrusted input. Exit is only kept for premium accounts.
export function cleanCard(input: Record<string, unknown>, premium: boolean, prev?: Card): Card {
  const now = Date.now();
  const exitRaw = input.exit;
  const exit = premium
    ? exitRaw === null || exitRaw === "" || exitRaw === undefined ? null : money(exitRaw)
    : prev?.exit ?? null;
  return {
    id: prev?.id || randomUUID(),
    pcId: /^\d+$/.test(str(input.pcId)) ? str(input.pcId) : "",
    name: str(input.name) || "Untitled card",
    number: str(input.number, 40),
    set: str(input.set),
    image: imageUrl(input.image),
    cost: money(input.cost),
    grading: money(input.grading),
    company: COMPANIES.includes(str(input.company)) ? str(input.company) : "PSA",
    grade: str(input.grade, 20),
    market: money(input.market),
    priceLabel: str(input.priceLabel, 40),
    priceUpdatedAt: typeof input.priceUpdatedAt === "number" ? input.priceUpdatedAt : prev?.priceUpdatedAt || 0,
    lastSale: "lastSale" in input ? lastSaleOf(input.lastSale) : prev?.lastSale ?? null,
    exit,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  };
}

export async function listCards(user: User): Promise<Card[]> {
  const all = await store.hgetall<Card>(key(user));
  return Object.values(all).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getCard(user: User, id: string) {
  return (await store.hgetall<Card>(key(user)))[id] || null;
}

export async function saveCard(user: User, card: Card) {
  await store.hset(key(user), card.id, card);
}

export async function deleteCard(user: User, id: string) {
  await store.hdel(key(user), id);
}

export async function refreshPrice(card: Card): Promise<Card> {
  if (!card.pcId) return card;
  try {
    const p = await getProduct(card.pcId);
    const { label, price, lastSale } = estimateFor(p, card.company, card.grade);
    return {
      ...card,
      image: card.image || p.image,
      market: price ?? card.market,
      priceLabel: price === null ? "" : label,
      priceUpdatedAt: price === null ? card.priceUpdatedAt : Date.now(),
      lastSale,
    };
  } catch {
    return card;
  }
}

// Copies the owner's cards from the original tracker into their account the first time they sign up.
export async function seedOwnerCards(user: User) {
  if (!ownerEmails().includes(user.email)) return;
  if ((await listCards(user)).length) return;
  let t = Date.now();
  for (const raw of seed as Record<string, unknown>[]) {
    const card = { ...cleanCard(raw, true), createdAt: t++ };
    await saveCard(user, await refreshPrice(card));
  }
}
