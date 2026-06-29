import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/robots.txt",
  "/sitemap.xml",
  // Vercel cron jobs hit these without a session — protected by CRON_SECRET in each handler
  "/api/agents/(.*)",
  "/api/cron/(.*)",
  // Webhook receivers authenticated by their own signature headers
  "/api/webhooks/(.*)",
  "/api/push/(.*)",
]);

const clerkProxy = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // Explicit redirect (not auth.protect(), which 404s unauthenticated page
    // requests in this Clerk version) so signed-out users land on /sign-in.
    const { userId, redirectToSignIn } = await auth();
    if (!userId) {
      return redirectToSignIn();
    }
  }
});

export { clerkProxy as proxy };
export default clerkProxy;

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and font/image assets
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|txt|xml|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
