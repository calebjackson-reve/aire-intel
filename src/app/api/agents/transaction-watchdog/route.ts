export const dynamic = "force-dynamic";
export const maxDuration = 120;
import { prisma } from "@/lib/prisma";
import { generateDraft } from "@/lib/draft-agent";
import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from "@/lib/cron-auth";
import { startRun, finishRun, failRun } from "@/lib/agent-run";
import { getTodayCT } from "@/lib/brief-date";
import { getLoopDetails } from "@/lib/dotloop"; // AIRE: loop:dotloop-sync-freshness
import { getSetting } from "@/lib/settings"; // AIRE: loop:dotloop-sync-freshness
import { sendSMS, getTwilioConfig, normalizePhone } from "@/lib/twilio"; // AIRE: loop:dotloop-sync-freshness
import { logError } from "@/lib/error-memory"; // AIRE: loop:dotloop-sync-freshness

// Transaction Watchdog — runs at 6:00 AM CT (12 UTC) via Vercel cron
// Finds active DotloopLoop records and Lead milestones due within 48h
// Creates urgent Tasks + ActionQueue items for client communication

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }
  return runWatchdog();
}

// Also callable via GET for manual dev trigger
export async function GET(request: Request) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized();
  return runWatchdog();
}

async function runWatchdog() {
  const runId = await startRun("transaction_watchdog");
  const today = getTodayCT();
  const errors: unknown[] = [];
  let itemsProcessed = 0;
  let actionsQueued = 0;

  try {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 1. Scan DotloopLoop records with closing/acceptance dates in range
    const activeLoops = await prisma.dotloopLoop.findMany({
      where: {
        status: { in: ["UNDER_CONTRACT", "PRE_OFFER"] },
        OR: [
          { closingDate: { lte: in48h, gte: now } },
          { expectedClosingDate: { lte: in48h, gte: now } },
          { acceptanceDate: { lte: in48h, gte: now } },
        ],
      },
      include: { lead: true },
    });

    for (const loop of activeLoops) {
      itemsProcessed++;
      const closingDate = loop.closingDate ?? loop.expectedClosingDate;
      const isUrgent = closingDate && closingDate <= in24h;
      const leadName = loop.lead?.name ?? loop.name;
      const leadId = loop.leadId;

      try {
        // Create an urgent task
        await prisma.task.create({
          data: {
            leadId,
            title: `[Watchdog] ${isUrgent ? "CLOSING TODAY" : "Closing in 48h"}: ${loop.streetAddress ?? loop.name}`,
            description: closingDate
              ? `Closing scheduled for ${closingDate.toLocaleDateString("en-US", { timeZone: "America/Chicago" })}`
              : undefined,
            dueDate: closingDate ?? now,
            priority: isUrgent ? "urgent" : "high",
          },
        });

        // Queue a client update email
        let emailBody = `Hi ${leadName},\n\nJust confirming your closing is scheduled for ${closingDate?.toLocaleDateString("en-US", { timeZone: "America/Chicago" })}. Please bring your ID and the wire confirmation to the title company.\n\nLet me know if you have any questions — Caleb`;

        if (leadId) {
          try {
            const draft = await generateDraft({
              leadId,
              channel: "email",
              source: "followup",
              instruction: `Write a brief, professional pre-closing check-in. Closing is ${isUrgent ? "today" : "within 48 hours"}. Remind them what to bring. Keep it under 5 sentences.`,
            });
            emailBody = draft.body;
          } catch {
            // Use default copy
          }
        }

        const lead = loop.lead;
        if (lead?.email) {
          await prisma.actionQueue.create({
            data: {
              type: "send_client_email",
              agentType: "transaction_watchdog",
              leadId,
              priority: isUrgent ? 1 : 2,
              briefDate: today,
              requiresApproval: true,
              payload: {
                to: lead.email,
                subject: isUrgent
                  ? `Closing today — ${loop.streetAddress ?? "your property"}`
                  : `Closing in 2 days — ${loop.streetAddress ?? "your property"}`,
                body: emailBody,
                leadId,
                leadName,
                closingDate: closingDate?.toISOString(),
                loopId: loop.id,
              },
            },
          });
          actionsQueued++;
        }

        // Dashboard notification for urgent closings
        if (isUrgent) {
          await prisma.notification.create({
            data: {
              type: "task_due",
              title: `Closing today: ${loop.streetAddress ?? loop.name}`,
              body: "Transaction Watchdog flagged this as closing today.",
              href: leadId ? `/contacts/${leadId}` : undefined,
            },
          });
        }
      } catch (err) {
        errors.push({ loop: loop.id, error: String(err) });
      }
    }

    // 2. Scan Lead records with closingDate in 48h
    const contractLeads = await prisma.lead.findMany({
      where: {
        stage: "under_contract",
        closingDate: { lte: in48h, gte: now },
      },
      select: { id: true, name: true, email: true, phone: true, closingDate: true, address: true },
    });

    for (const lead of contractLeads) {
      itemsProcessed++;
      const isUrgent = lead.closingDate! <= in24h;

      try {
        // Idempotency: check if task already exists
        const existingTask = await prisma.task.findFirst({
          where: { leadId: lead.id, title: { contains: "[Watchdog]" }, done: false },
        });

        if (!existingTask) {
          await prisma.task.create({
            data: {
              leadId: lead.id,
              title: `[Watchdog] ${isUrgent ? "Closing TODAY" : "Closing in 48h"}: ${lead.name}`,
              dueDate: lead.closingDate!,
              priority: isUrgent ? "urgent" : "high",
            },
          });
          actionsQueued++;
        }
      } catch (err) {
        errors.push({ leadId: lead.id, error: String(err) });
      }
    }

    // 3. Sync freshness pass — alert when a closing loop hasn't synced in >12h
    // AIRE: loop:dotloop-sync-freshness
    try {
      const authStatus = (await getSetting("dotloop.authStatus")) ?? "ok";
      if (authStatus === "expired") {
        // Unit C: skip API calls entirely and surface a single warning
        await prisma.notification.create({
          data: {
            type: "warning",
            title: "Dotloop auth expired — sync freshness check skipped",
            body: "Reconnect Dotloop in Settings to resume stale-loop alerts.",
            href: "/settings",
          },
        });
      } else {
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        const staleClosingLoops = await prisma.dotloopLoop.findMany({
          where: {
            status: { notIn: ["CLOSED", "SOLD", "LEASED"] },
            lastSyncedAt: { lt: twelveHoursAgo },
            OR: [
              { closingDate: { lte: in48h, gte: now } },
              { expectedClosingDate: { lte: in48h, gte: now } },
            ],
          },
          include: { lead: true },
        });

        for (const loop of staleClosingLoops) {
          try {
            const detail = await getLoopDetails(loop.dotloopId);
            if (!detail) continue;

            const staleSinceHours = Math.floor(
              (now.getTime() - loop.lastSyncedAt.getTime()) / (60 * 60 * 1000),
            );
            const closingDate = loop.closingDate ?? loop.expectedClosingDate;
            const closingInHours = closingDate
              ? Math.floor((closingDate.getTime() - now.getTime()) / (60 * 60 * 1000))
              : null;
            const address = loop.streetAddress ?? loop.name;
            const isWithin24h = closingDate && closingDate <= in24h;

            await prisma.notification.create({
              data: {
                type: "warning",
                title: `Stale sync: ${address}`,
                body: `${address}: closing in ${closingInHours ?? "?"}h but DotLoop last synced ${staleSinceHours}h ago`,
                href: loop.leadId ? `/contacts/${loop.leadId}` : undefined,
              },
            });
            actionsQueued++;

            if (isWithin24h) {
              const twilioConfig = await getTwilioConfig();
              const calebPhone = await getSetting("CALEB_PHONE");
              if (twilioConfig && calebPhone) {
                await sendSMS(
                  normalizePhone(calebPhone),
                  `Closing ${closingInHours != null && closingInHours <= 12 ? "today" : "tomorrow"} — Dotloop hasn't synced in ${staleSinceHours}h for ${address}`,
                  twilioConfig,
                );
              }
            }
          } catch (err) {
            await logError("dotloop", "transaction-watchdog/sync-freshness", err, {
              loopId: loop.dotloopId,
            });
          }
        }
      }
    } catch (err) {
      errors.push({ step: "sync_freshness", error: String(err) });
    }

    // 4. SmartPlan enrollment decay pass — flag enrollments stalled >48h
    // AIRE: loop:smart-plan-enrollment-decay
    let stalledEnrollmentCount = 0;
    try {
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const totalActive = await prisma.smartPlanEnrollment.count({
        where: { active: true },
      });

      const stalledEnrollments = await prisma.smartPlanEnrollment.findMany({
        where: {
          active: true,
          nextStepAt: { not: null, lt: fortyEightHoursAgo },
        },
        include: { lead: true, plan: true },
        take: 20,
        orderBy: { nextStepAt: "asc" },
      });

      stalledEnrollmentCount = stalledEnrollments.length;

      for (const enrollment of stalledEnrollments) {
        itemsProcessed++;
        try {
          const existing = await prisma.actionQueue.findFirst({
            where: {
              leadId: enrollment.leadId,
              type: "create_lofty_task",
              agentType: "smart_plan_watchdog",
              status: "pending",
            },
          });
          if (existing) continue;

          const staleHours = Math.floor(
            (now.getTime() - (enrollment.nextStepAt?.getTime() ?? 0)) / (60 * 60 * 1000),
          );

          await prisma.actionQueue.create({
            data: {
              type: "create_lofty_task",
              agentType: "smart_plan_watchdog",
              leadId: enrollment.leadId,
              priority: 4,
              briefDate: today,
              requiresApproval: true,
              payload: {
                enrollmentId: enrollment.id,
                leadId: enrollment.leadId,
                leadName: enrollment.lead?.name ?? "Unknown",
                planId: enrollment.planId,
                planName: enrollment.plan?.name ?? "Unknown Plan",
                currentStep: enrollment.currentStep,
                staleHours,
                title: `[SmartPlan] Stalled: ${enrollment.lead?.name ?? "Unknown"} — Step ${enrollment.currentStep} overdue ${staleHours}h`,
              },
            },
          });
          actionsQueued++;
        } catch (err) {
          await logError("api_failure", "transaction-watchdog/enrollment-decay", err, {
            enrollmentId: enrollment.id,
          });
        }
      }

      // Alert Caleb if >30% of active enrollments are stalled (likely executor failure)
      if (totalActive > 0 && stalledEnrollmentCount / totalActive > 0.3) {
        await prisma.notification.create({
          data: {
            type: "warning",
            title: `SmartPlan alert: ${stalledEnrollmentCount}/${totalActive} enrollments stalled`,
            body: `${Math.round((stalledEnrollmentCount / totalActive) * 100)}% of active SmartPlan enrollments are overdue >48h — possible executor failure.`,
            href: "/smart-plans",
          },
        });
      }

      await prisma.setting.upsert({
        where: { key: "smartplan.stalledCount" },
        update: { value: String(stalledEnrollmentCount) },
        create: { key: "smartplan.stalledCount", value: String(stalledEnrollmentCount) },
      });
    } catch (err) {
      errors.push({ step: "enrollment_decay", error: String(err) });
    }

    await finishRun(runId, { itemsProcessed, actionsQueued, errorLog: errors });

    return Response.json({
      ok: true,
      runId,
      itemsProcessed,
      actionsQueued,
      loopsScanned: activeLoops.length,
      contractLeadsScanned: contractLeads.length,
      stalledEnrollments: stalledEnrollmentCount,
    });
  } catch (err) {
    await failRun(runId, err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
