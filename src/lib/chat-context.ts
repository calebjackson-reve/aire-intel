import { prisma } from "@/lib/prisma";

export interface ChatContext {
  page: string;
  pageLabel?: string;
  todayISO: string;
  pendingActions: number;
  coldLeads: number;
  draftPosts: number;
  activeThreadId?: string;
}

export async function buildServerChatContext(pathname: string, threadId?: string): Promise<ChatContext> {
  const cutoff = new Date(Date.now() - 7 * 86400000);
  const [pendingActions, coldLeads, draftPosts] = await Promise.all([
    prisma.actionQueue.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.lead.count({
      where: { stage: { in: ["active", "showing", "new_lead"] }, OR: [{ lastContactDate: null }, { lastContactDate: { lt: cutoff } }] },
    }).catch(() => 0),
    prisma.scheduledPost.count({ where: { status: "draft" } }).catch(() => 0),
  ]);

  return {
    page: pathname,
    todayISO: new Date().toISOString().split("T")[0],
    pendingActions,
    coldLeads,
    draftPosts,
    activeThreadId: threadId,
  };
}
