import { clerkMiddleware, createRouteMatcher, clerkClient } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

// Clerk's pk_live/sk_live keys are domain-locked to aireintel.org and cannot run
// on localhost. In non-production ONLY, skip the gate entirely so the app is
// renderable for local visual verification. Production stays fully gated +
// single-email-locked below — this flag is true exclusively under `next dev`.
const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Routes that must stay PUBLIC (no Clerk gate):
 * - Clerk's own sign-in/sign-up flows
 * - Machine-to-machine API routes that authenticate with their OWN secrets:
 *     /api/webhooks/*  → X-AIRE-Secret (Zapier inbound lead sync, Meta, Calendly)
 *     /api/cron/*      → Bearer CRON_SECRET (Vercel cron)
 *     /api/agents/*    → Bearer CRON_SECRET (Vercel cron-triggered agents)
 *   Gating these with Clerk would break lead sync + every scheduled automation.
 * - PWA manifest + the not-authorized page.
 */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/not-authorized",
  "/api/webhooks(.*)",
  "/api/cron(.*)",
  "/api/agents(.*)",
  "/manifest.json",
]);

// Single-tenant lock: only this email may use the app.
const ALLOWED_EMAIL = (process.env.ALLOWED_EMAIL ?? "caleb.jackson@reverealtors.com").toLowerCase();

const clerkGate = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  // Lock the app to a single email — block any other signed-in account.
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
    if (email !== ALLOWED_EMAIL) {
      return NextResponse.redirect(new URL("/not-authorized", req.url));
    }
  } catch {
    // If the identity lookup fails, fail closed.
    return redirectToSignIn();
  }
});

// Production: full Clerk gate. Local dev: pass-through (Clerk can't run on localhost).
export default IS_PROD
  ? clerkGate
  : function devPassThrough(_req: NextRequest) {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    // Run on all routes except Next internals and static assets …
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // … and always on API/TRPC routes.
    "/(api|trpc)(.*)",
  ],
};
