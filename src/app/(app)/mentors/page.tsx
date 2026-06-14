import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { eq } from "drizzle-orm";
import { db } from "../../../../data/db";
import { mentor } from "../../../../data/schema";
import MentorList from "./MentorList";

export default async function MentorsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const mentors = await db
    .select()
    .from(mentor)
    .where(eq(mentor.userId, session.user.id))
    .orderBy(mentor.createdAt);

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/20 shrink-0">
        <div>
          <h1 className="text-amber-100 font-bold text-sm tracking-tight">
            Mentors
          </h1>
          <p className="text-xs text-amber-400/40 mt-0.5">
            LLM agents that score student responses during RL training
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <MentorList initialMentors={mentors} />
      </div>
    </div>
  );
}
