import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../../data/db";
import { user } from "../../../../../data/schema";
import { AdminShell } from "../AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt));

  return (
    <AdminShell current="Users">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
          Users
        </h1>
        <p className="mt-3 text-sm text-amber-200/55">
          Everyone with an account on Piro.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-amber-900/25 bg-[#13100c]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-amber-900/25 bg-amber-900/10 text-xs uppercase tracking-[0.14em] text-amber-500/55">
              <tr>
                <th className="px-5 py-4 font-semibold">User</th>
                <th className="px-5 py-4 font-semibold">Joined</th>
                <th className="px-5 py-4 font-semibold">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-900/15">
              {users.map((item) => (
                <tr key={item.id} className="text-amber-100/80">
                  <td className="px-5 py-4">
                    <div className="font-medium text-amber-50">{item.name}</div>
                    <div className="mt-1 text-xs text-amber-500/55">
                      {item.email}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-amber-300/60">
                    {item.createdAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${item.role === "admin" ? "border-orange-500/25 bg-orange-500/10 text-orange-300" : "border-amber-800/30 bg-amber-900/15 text-amber-400/65"}`}
                    >
                      {item.role === "admin" ? "Admin" : "User"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && (
          <p className="px-5 py-12 text-center text-sm text-amber-200/55">
            No users yet.
          </p>
        )}
      </div>
    </AdminShell>
  );
}
