import { NextResponse } from "next/server";

export const FLASH_COOKIE = "piro_flash_error";

export function flashError(res: NextResponse, code: string): NextResponse {
  res.cookies.set(FLASH_COOKIE, code, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 30,
    path: "/",
  });
  return res;
}
