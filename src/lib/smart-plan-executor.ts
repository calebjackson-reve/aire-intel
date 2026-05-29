// Smart Plan Executor — AIRE Platform
//
// Enrolls leads in Smart Plans and advances them step-by-step.
// Each "step" is a scheduled outreach action (text, email, task, call_reminder).
//
// Flow:
//   1. enrollLead(planId, leadId) — creates SmartPlanEnrollment at step 0
//   2. advanceEnrollments()       — checks all active enrollments, fires steps whose due date has passed
//   3. Step execution             — delegates to /api/followup (text) or /api/email (email)
//                                   or creates a Task (task / call_reminder)
//
// Called:
//   - enrollLead: from Smart Plans UI when user clicks "Enroll"
//   - advanceEnrollments: on each dashboard load (lightweight DB check)

import { prisma } from "./prisma";

// SmartPlan step shape (stored as JSON in SmartPlan.steps)
interface PlanStep {
  day: number;          // days after enrollment to fire
  method: "text" | "email" | "call_reminder" | "task";
  subject?: string;     // email subject
  message: string;      // body / task title
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Enroll a lead in a plan. Idempotent — won't double-enroll. */
export async function enrollLead(planId: string, leadId: string): Promise<{ enrolled: boolean; message: string }> {
  // Check existing active enrollment
  const existing = await prisma.smartPlanEnrollment.findFirst({
    where: { planId, leadId, active: true },
  });
  if (existing) return { enrolled: false, message: "Already enrolled" };

  const plan = await prisma.smartPlan.findUnique({ where: { id: planId } });
  if (!plan) return { enrolled: false, message: "Plan not found" };

  await prisma.smartPlanEnrollment.create({
    data: {
      planId,
      leadId,
      currentStep: 0,
      active: true,
      startedAt: new Date(),
    },
  });

  return { enrolled: true, message: `Enrolled in "${plan.name}"` };
}

/** Advance all due enrollments. Call on dashboard load or via cron. */
export async function advanceEnrollments(): Promise<{ fired: number; completed: number }> {
  const enrollments = await prisma.smartPlanEnrollment.findMany({
    where: { active: true },
    include: {
      plan: true,
      lead: { select: { id: true, name: true, phone: true, email: true, stage: true } },
    },
  });

  let fired = 0;
  let completed = 0;
  const now = new Date();

  for (const enrollment of enrollments) {
    let steps: PlanStep[] = [];
    try {
      steps = JSON.parse(enrollment.plan.steps as string) as PlanStep[];
    } catch {
      continue;
    }

    const stepIndex = enrollment.currentStep;
    if (stepIndex >= steps.length) {
      // Plan complete
      await prisma.smartPlanEnrollment.update({
        where: { id: enrollment.id },
        data: { active: false, nextStepAt: null },
      });
      completed++;
      continue;
    }

    const step = steps[stepIndex];
    const startedAt = enrollment.startedAt;
    const dueAt = new Date(startedAt.getTime() + step.day * 24 * 60 * 60 * 1000);

    if (now < dueAt) continue; // Not due yet

    // Fire the step
    try {
      await fireStep(step, enrollment.lead);
      fired++;

      // Advance to next step
      const nextStep = stepIndex + 1;
      const isDone = nextStep >= steps.length;
      await prisma.smartPlanEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentStep: nextStep,
          nextStepAt: isDone ? null : new Date(now.getTime() + (steps[nextStep]?.day ?? 0) * 24 * 60 * 60 * 1000),
          active: !isDone,
        },
      });
      if (isDone) completed++;
    } catch (err) {
      console.error(`[smart-plan] Failed step ${stepIndex} for lead ${enrollment.leadId}:`, err);
    }
  }

  return { fired, completed };
}

async function fireStep(
  step: PlanStep,
  lead: { id: string; name: string; phone: string | null; email: string | null; stage: string }
) {
  switch (step.method) {
    case "text": {
      if (!lead.phone) return;
      await fetch(`${BASE_URL}/api/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          to: lead.phone,
          message: step.message,
          logActivity: true,
        }),
      });
      break;
    }
    case "email": {
      if (!lead.email) return;
      await fetch(`${BASE_URL}/api/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          to: lead.email,
          subject: step.subject ?? "Following up",
          body: step.message,
        }),
      });
      break;
    }
    case "task":
    case "call_reminder": {
      await prisma.task.create({
        data: {
          leadId: lead.id,
          title: step.message,
          dueDate: new Date(), // due now
          priority: step.method === "call_reminder" ? "high" : "medium",
          done: false,
        },
      });
      break;
    }
  }
}

/** Get enrollment status for a plan+lead combo */
export async function getEnrollmentStatus(planId: string, leadId: string) {
  return prisma.smartPlanEnrollment.findFirst({
    where: { planId, leadId },
    orderBy: { startedAt: "desc" },
  });
}
