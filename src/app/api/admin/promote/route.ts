import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { user } from "../../../../../data/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// POST /api/admin/promote
// Promotes a user to admin role. Two auth methods:
//   1. Bearer ADMIN_SECRET (one-time bootstrap; set in env)
//   2. Existing admin session (promote other admins later)
// Body: { email: string }
// Returns: { success: true, email: string, role: "admin" }
export async function POST(request: Request) {
  const headersList = await headers();
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = request.headers.get("authorization");

  // Method 1: Bearer admin secret — for bootstrapping the first admin
  const isSecretAuth =
    adminSecret && authHeader === `Bearer ${adminSecret}`;

  // Method 2: Existing admin session
  const session = await auth.api.getSession({ headers: headersList });
  const { isAdmin } = await import("~/lib/admin");
  const isAdminAuth = isAdmin(session);

  if (!isSecretAuth && !isAdminAuth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.toLowerCase().trim();
  if (!email) return Response.json({ error: "email is required" }, { status: 400 });

  const [updated] = await db
    .update(user)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(user.email, email))
    .returning({ id: user.id, email: user.email });

  if (!updated) {
    return Response.json({ error: `User not found: ${email}` }, { status: 404 });
  }

  return Response.json({ success: true, email: updated.email, role: "admin" });
}