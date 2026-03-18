import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const ORDER_ACCESS_COOKIE_PREFIX = "kira_order_access_";
const ORDER_ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 2;

function buildOrderAccessCookieName(orderId: string) {
  const suffix = createHash("sha256").update(orderId).digest("hex").slice(0, 24);
  return `${ORDER_ACCESS_COOKIE_PREFIX}${suffix}`;
}

function buildOrderAccessCookieOptions() {
  return {
    httpOnly: true,
    maxAge: ORDER_ACCESS_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function setOrderAccessCookie(
  response: NextResponse,
  orderId: string,
  accessToken: string,
) {
  response.cookies.set({
    name: buildOrderAccessCookieName(orderId),
    value: accessToken,
    ...buildOrderAccessCookieOptions(),
  });
}

export function clearOrderAccessCookie(response: NextResponse, orderId: string) {
  response.cookies.set({
    name: buildOrderAccessCookieName(orderId),
    value: "",
    ...buildOrderAccessCookieOptions(),
    maxAge: 0,
  });
}

export async function getOrderAccessCookie(orderId: string) {
  const cookieStore = await cookies();
  return cookieStore.get(buildOrderAccessCookieName(orderId))?.value?.trim() || null;
}
