import { NextResponse } from "next/server";
import { currentUser, type User } from "./auth";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function withUser(fn: (user: User) => Promise<Response>) {
  const user = await currentUser();
  if (!user) return fail("Sign in to continue.", 401);
  return fn(user);
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}
