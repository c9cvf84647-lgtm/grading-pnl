import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { store } from "./store";

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "gpnl_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

export type User = {
  id: string;
  email: string;
  passHash: string;
  salt: string;
  premium?: boolean;
  createdAt: number;
};

export type PublicUser = { email: string; premium: boolean };

export const normEmail = (e: string) => e.trim().toLowerCase();

function listEnv(name: string) {
  return (process.env[name] || "")
    .split(",")
    .map(normEmail)
    .filter(Boolean);
}

// The site owner (OWNER_EMAIL) and anyone in PREMIUM_EMAILS always has premium.
export function ownerEmails() {
  return listEnv("OWNER_EMAIL");
}

export function isPremium(user: User) {
  return Boolean(user.premium) || [...ownerEmails(), ...listEnv("PREMIUM_EMAILS")].includes(user.email);
}

export function toPublic(user: User): PublicUser {
  return { email: user.email, premium: isPremium(user) };
}

async function hash(password: string, salt: string) {
  return (await scrypt(password, salt, 64)).toString("hex");
}

export async function createUser(email: string, password: string): Promise<User | null> {
  const key = "user:" + email;
  if (await store.get(key)) return null;
  const salt = randomBytes(16).toString("hex");
  const user: User = { id: randomUUID(), email, salt, passHash: await hash(password, salt), createdAt: Date.now() };
  await store.set(key, user);
  return user;
}

export async function checkPassword(email: string, password: string): Promise<User | null> {
  const user = await store.get<User>("user:" + email);
  // Hash even when the user is missing so response time doesn't reveal which emails exist
  const candidate = Buffer.from(await hash(password, user?.salt || "0".repeat(32)), "hex");
  if (!user) return null;
  const actual = Buffer.from(user.passHash, "hex");
  return actual.length === candidate.length && timingSafeEqual(actual, candidate) ? user : null;
}

export async function startSession(user: User) {
  const token = randomBytes(32).toString("hex");
  await store.set("session:" + token, user.email, SESSION_TTL);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await store.del("session:" + token);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const email = await store.get<string>("session:" + token);
  if (!email) return null;
  return store.get<User>("user:" + email);
}

// Allows 10 attempts per key per 15 minutes
export async function rateLimited(key: string) {
  return (await store.incr("rl:" + key, 15 * 60)) > 10;
}
