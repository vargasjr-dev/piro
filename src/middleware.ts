import { NextRequest, NextResponse } from "next/server";

// Inject the pathname as a header so server components can read it.
// (Server components can't access next/navigation in async context.)
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("x-pathname", request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/stripe/webhook).*)"],
};
