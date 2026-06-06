import { NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { r2List } from "~/lib/r2";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const paths = await r2List(session.user.id);
    return NextResponse.json({ paths });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
