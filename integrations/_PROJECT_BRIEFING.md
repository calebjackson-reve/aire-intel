# AIRE Platform — Project Briefing

Generated: 2026-05-19
Repo: `/Users/caleb/aire-platform`
Purpose: Shareable briefing for another AI assistant to read before giving advice.

---

═══════════════════════════════════════════
## SECTION 1 — PROJECT INTENT
═══════════════════════════════════════════

### CLAUDE.md (verbatim)

```markdown
@AGENTS.md

# AIRE Platform — Project Context

AIRE is Caleb Jackson's internal operations platform for Rêve Realtors® in Baton Rouge, LA. It is a Next.js app that consolidates Lofty CRM, Paragon MLS, Meta social, AI content generation, and pipeline management into one luxury UI.

**Dev server:** `npm run dev` → http://localhost:3000
**DB:** SQLite via Prisma v7 with better-sqlite3 adapter. After any schema change: `npx prisma migrate dev && npx prisma generate`, then restart the server.

---

## What's built

| Route | What it does |
|---|---|
| `/` | Dashboard — KPIs, charts, Morning Brief, HotListings drawer, CalendarWidget |
| `/pipeline` | Kanban — 5 stages, drag-and-drop (@dnd-kit), AI follow-up per card |
| `/contacts` | Contact list with stage filter and cold-lead detection |
| `/contacts/[id]` | Full profile — activity log, tasks, AI follow-up stream, edit modal |
| `/buyers` | Buyer search profiles with auto-match from Paragon listings |
| `/smart-plans` | AI-generated drip campaign sequences |
| `/create-post` | Post generator — Claude streams caption + slide copy + motion spec |
| `/social` | Facebook/Instagram composer via Meta Graph API |
| `/mls` | Paragon MLS iframe embed |
| `/settings` | Lofty OAuth setup (3-credential form + test + sync) |
| `/system` | Karpathy error dashboard — health score, patterns, full error log |

Key components: `HotListings`, `CalendarWidget`, `NotificationCenter`, `ErrorBoundary`, `AIAssistant`, `Nav`

---

## Lofty CRM — OAuth 2.0 (IMPORTANT)

Lofty requires OAuth 2.0 Client Credentials, NOT a raw API key as Bearer token.

**Flow:** `POST https://api.lofty.com/oauth/token` with `grant_type=client_credentials` + `client_id` + `client_secret` + `customer_key` → returns access token → use as `Authorization: Bearer <token>`

**Env vars required:**
```
LOFTY_CLIENT_ID       # from developer.lofty.com — register an app
LOFTY_CLIENT_SECRET   # from developer.lofty.com app
LOFTY_CUSTOMER_KEY    # from CRM Settings → Integrations → Open API → Generate Key
```

The previous bug (`code 200058, "User in token does not exist"`) was caused by sending the raw `customer_key` as a Bearer token. This is fixed in `src/lib/lofty.ts`. Token is cached in memory with auto-refresh.

---

## Design System (LOCKED — never substitute brand tokens)

```
--reve-black:  #09090B   (background)
--reve-coral:  #EE8172   (primary accent)
--reve-blue:   #728AC5
--reve-cream:  #EFDD84
```

Classes: `.glass-card`, `.btn-primary`, `.btn-ghost`, `.aire-input`, `.live-dot`, `.skeleton`

Aesthetic target: morningside.studio tier — glass, depth, slow, editorial. No Canva energy.

Nav has `paddingLeft: 80px` to clear the HotListings left-edge tab.

---

## Error Memory System

`src/lib/error-memory.ts` — Karpathy-style self-improving error loop:
- `logError(type, source, err, context?)` — logs to ErrorLog table
- `withRetry(fn, opts)` — 3 attempts, 500→1000→2000ms backoff
- `detectPatterns()` — finds recurring errors in 24h window
- `getHealthScore()` — 0-100 score, improving/stable/degrading trend

Always wrap external API calls (Lofty, Paragon, Meta, Anthropic) in `withRetry`.

---

## Other integrations pending

- **Paragon:** needs `PARAGON_API_URL` + `PARAGON_API_KEY` in `.env` (falls back to demo listings)
- **Meta:** needs `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_BUSINESS_ID`
- **Webhook real-time sync:** needs AIRE on a public URL (Netlify/Vercel) first

---

## Security rules

- API keys always in `.env`, never in chat or source code
- If a key appears in conversation, treat it as compromised and flag for rotation immediately
- Never run untrusted install scripts
```

### AGENTS.md (verbatim)

```markdown
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
```

### README.md (verbatim)

```markdown
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

` ` `bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
` ` `

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

(Default boilerplate README — not updated for AIRE.)
```

---

═══════════════════════════════════════════
## SECTION 2 — STACK & DEPENDENCIES
═══════════════════════════════════════════

### package.json

```json
{
  "name": "aire-platform",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.96.0",
    "@clerk/nextjs": "^7.3.7",
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@prisma/adapter-better-sqlite3": "^7.8.0",
    "@prisma/client": "^7.8.0",
    "@types/papaparse": "^5.5.2",
    "better-sqlite3": "^12.10.0",
    "next": "16.2.6",
    "papaparse": "^5.5.3",
    "prisma": "^7.8.0",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "recharts": "^3.8.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "dotenv": "^17.4.2",
    "eslint": "^9",
    "eslint-config-next": "16.2.6",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

### next.config.ts

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
```

### vercel.json

_File does not exist._

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

### Top-level directory listing

```
.claude/                 (Claude Code settings)
.env                     (974 bytes — values redacted, key names in §8)
.env.save                (legacy backup — not committed)
.git/
.gitignore
.next/                   (build output)
AGENTS.md
CLAUDE.md
README.md
dev.db                   (815 KB — local SQLite, duplicate of prisma/dev.db)
eslint.config.mjs
integrations/            (this folder)
next-env.d.ts
next.config.ts
node_modules/
package-lock.json
package.json
postcss.config.mjs
prisma/
prisma.config.ts
public/
src/
tsconfig.json
tsconfig.tsbuildinfo
```

**Note:** Two `dev.db` files exist — one at repo root and one in `prisma/`. The prisma one is the live DB; the root one was the source of an earlier bug where the app wrote to one and the page read from the other.

---

═══════════════════════════════════════════
## SECTION 3 — DOMAIN MODEL
═══════════════════════════════════════════

### prisma/schema.prisma (verbatim)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
}

model Lead {
  id              String    @id @default(cuid())
  // Identity
  name            String
  firstName       String?
  lastName        String?
  phone           String?
  email           String?
  // Pipeline
  stage           String    @default("new_lead")
  type            String    @default("buyer")   // buyer | seller | both | investor | referral
  pricePoint      Float?
  priceMin        Float?
  priceMax        Float?
  // Property interest
  address         String?
  beds            Int?
  baths           Float?
  sqftMin         Int?
  sqftMax         Int?
  areas           String?   // comma-separated neighborhoods/parishes
  // Context
  motivation      String?
  timeline        String?   // immediate | 1-3mo | 3-6mo | 6-12mo | 12mo+
  preApproved     Boolean   @default(false)
  preApprovalAmt  Float?
  referredBy      String?
  source          String?
  tags            String?   // comma-separated
  // Follow-up
  lastContactDate DateTime?
  nextActionDate  DateTime?
  nextActionNote  String?
  assignedTo      String?
  // Lofty import fields
  loftyId         String?   @unique
  // Meta
  notes           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  timeline_logs ContactLog[]
  posts         GeneratedPost[]
  tasks         Task[]
  smartPlans    SmartPlanEnrollment[]
  buyerSearches BuyerSearch[]
}

model ContactLog {
  id        String   @id @default(cuid())
  leadId    String
  lead      Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  method    String   // text | call | email | showing | meeting | note | ai_message
  note      String?
  direction String   @default("outbound") // inbound | outbound
  createdAt DateTime @default(now())
}

model Task {
  id          String    @id @default(cuid())
  leadId      String?
  lead        Lead?     @relation(fields: [leadId], references: [id], onDelete: SetNull)
  title       String
  description String?
  dueDate     DateTime?
  priority    String    @default("normal") // urgent | high | normal | low
  done        Boolean   @default(false)
  doneAt      DateTime?
  assignedTo  String?
  createdAt   DateTime  @default(now())
}

model SmartPlan {
  id          String   @id @default(cuid())
  name        String
  description String?
  triggerType String   // new_lead | stage_change | no_contact | manual
  steps       String   // JSON array of steps
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())

  enrollments SmartPlanEnrollment[]
}

model SmartPlanEnrollment {
  id          String    @id @default(cuid())
  leadId      String
  lead        Lead      @relation(fields: [leadId], references: [id], onDelete: Cascade)
  planId      String
  plan        SmartPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  currentStep Int       @default(0)
  active      Boolean   @default(true)
  startedAt   DateTime  @default(now())
  nextStepAt  DateTime?
}

model GeneratedPost {
  id         String   @id @default(cuid())
  leadId     String?
  lead       Lead?    @relation(fields: [leadId], references: [id], onDelete: SetNull)
  postType   String
  address    String?
  price      Float?
  rawNotes   String?
  caption    String?
  slideCopy  String?
  motionSpec String?
  platform   String   @default("instagram")
  approved   Boolean  @default(false)
  createdAt  DateTime @default(now())
}

model DailyBrief {
  id        String   @id @default(cuid())
  content   String
  date      DateTime @default(now())
}

model BuyerSearch {
  id          String   @id @default(cuid())
  leadId      String?
  lead        Lead?    @relation(fields: [leadId], references: [id], onDelete: SetNull)
  name        String   // "The Joneses – Gardere $350K"
  priceMin    Float?
  priceMax    Float?
  bedsMin     Int?
  bathsMin    Float?
  sqftMin     Int?
  areas       String?  // comma-separated zip codes / neighborhoods
  propertyTypes String? // comma-separated: residential,condo,land
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())

  alerts      ListingAlert[]
}

model ListingAlert {
  id            String      @id @default(cuid())
  buyerSearchId String
  buyerSearch   BuyerSearch @relation(fields: [buyerSearchId], references: [id], onDelete: Cascade)
  mlsNumber     String
  address       String
  price         Float
  beds          Int?
  baths         Float?
  sqft          Int?
  photoUrl      String?
  listingUrl    String?
  listedAt      DateTime    @default(now())
  seen          Boolean     @default(false)
  emailed       Boolean     @default(false)
}

model Notification {
  id        String   @id @default(cuid())
  type      String   // listing_match | lead_assigned | task_due | sync_complete | social_post
  title     String
  body      String?
  href      String?
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}

model SocialConnection {
  id           String   @id @default(cuid())
  platform     String   @unique // facebook | instagram
  accessToken  String
  pageId       String?
  pageName     String?
  expiresAt    DateTime?
  connectedAt  DateTime @default(now())
}

// Karpathy-style error memory: every failure is logged, attributed, and tracked to resolution
model ErrorLog {
  id         String   @id @default(cuid())
  type       String   // api_failure | validation | sync | ui | ai | lofty | paragon | meta
  source     String   // which route/component/function
  message    String
  context    String?  // JSON: what was happening when it failed
  stack      String?
  attempts   Int      @default(1)
  resolved   Boolean  @default(false)
  resolution String?  // what fixed it
  resolvedAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model Setting {
  id        String   @id @default(cuid())
  key       String   @unique
  value     String
  updatedAt DateTime @updatedAt
}

model ScheduledPost {
  id           String   @id @default(cuid())
  platform     String   // facebook | instagram | both
  caption      String
  imageUrl     String?
  scheduledFor DateTime?
  publishedAt  DateTime?
  status       String   @default("draft") // draft | scheduled | published | failed
  postId       String?  // platform post ID after publish
  leadId       String?
  createdAt    DateTime @default(now())
}
```

### Migration filenames

```
20260519033837_init
20260519041242_crm_expansion
20260519045747_integrations_expansion
20260519172709_error_memory
20260519202522_add_settings
migration_lock.toml
```

---

═══════════════════════════════════════════
## SECTION 4 — ARCHITECTURE
═══════════════════════════════════════════

### src tree (3 levels)

```
src/
├── app/
│   ├── api/
│   │   ├── assistant/route.ts
│   │   ├── auth/google/
│   │   │   ├── route.ts
│   │   │   └── callback/route.ts
│   │   ├── brief/route.ts
│   │   ├── buyers/route.ts
│   │   ├── calendar/route.ts
│   │   ├── calendly/route.ts
│   │   ├── contacts/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       └── timeline/route.ts
│   │   ├── dotloop/route.ts
│   │   ├── email/route.ts
│   │   ├── errors/route.ts
│   │   ├── followup/route.ts
│   │   ├── google/contacts/
│   │   │   ├── sync/route.ts
│   │   │   └── upload/route.ts
│   │   ├── import/route.ts
│   │   ├── leads/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── listings/route.ts
│   │   ├── lofty/
│   │   │   ├── hot-warm/route.ts
│   │   │   ├── sync/route.ts
│   │   │   └── webhook/route.ts
│   │   ├── market/route.ts
│   │   ├── notifications/route.ts
│   │   ├── posts/route.ts
│   │   ├── rpr/route.ts
│   │   ├── settings/route.ts
│   │   ├── smart-plans/route.ts
│   │   ├── smartplans/         (empty dir — typo/dupe of smart-plans)
│   │   ├── sms/route.ts
│   │   ├── social/route.ts
│   │   └── tasks/route.ts
│   ├── apps/page.tsx
│   ├── buyers/page.tsx
│   ├── contacts/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── create-post/page.tsx
│   ├── crm/page.tsx
│   ├── import/page.tsx
│   ├── mls/page.tsx
│   ├── pipeline/page.tsx
│   ├── settings/page.tsx
│   ├── smart-plans/page.tsx
│   ├── social/page.tsx
│   ├── system/page.tsx
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                (dashboard)
├── components/
│   ├── AIAssistant.tsx
│   ├── CalendarWidget.tsx
│   ├── EmbeddedApp.tsx
│   ├── ErrorBoundary.tsx
│   ├── HotListings.tsx
│   ├── Nav.tsx
│   ├── NotificationCenter.tsx
│   └── charts/
└── lib/
    ├── calendly.ts
    ├── dotloop.ts
    ├── error-memory.ts
    ├── google-calendar.ts
    ├── google.ts
    ├── lofty.ts
    ├── prisma.ts
    ├── reve-system-prompt.ts
    ├── rpr.ts
    ├── sendgrid.ts
    ├── settings.ts
    └── twilio.ts
```

### Full API route list

```
src/app/api/assistant/route.ts
src/app/api/auth/google/callback/route.ts
src/app/api/auth/google/route.ts
src/app/api/brief/route.ts
src/app/api/buyers/route.ts
src/app/api/calendar/route.ts
src/app/api/calendly/route.ts
src/app/api/contacts/[id]/route.ts
src/app/api/contacts/[id]/timeline/route.ts
src/app/api/contacts/route.ts
src/app/api/dotloop/route.ts
src/app/api/email/route.ts
src/app/api/errors/route.ts
src/app/api/followup/route.ts
src/app/api/google/contacts/sync/route.ts
src/app/api/google/contacts/upload/route.ts
src/app/api/import/route.ts
src/app/api/leads/[id]/route.ts
src/app/api/leads/route.ts
src/app/api/listings/route.ts
src/app/api/lofty/hot-warm/route.ts
src/app/api/lofty/sync/route.ts
src/app/api/lofty/webhook/route.ts
src/app/api/market/route.ts
src/app/api/notifications/route.ts
src/app/api/posts/route.ts
src/app/api/rpr/route.ts
src/app/api/settings/route.ts
src/app/api/smart-plans/route.ts
src/app/api/sms/route.ts
src/app/api/social/route.ts
src/app/api/tasks/route.ts
```

### Page directories

```
apps  buyers  contacts  create-post  crm  import  mls  pipeline
settings  smart-plans  social  system
```

### lib/ directory

```
calendly.ts  dotloop.ts  error-memory.ts  google-calendar.ts
google.ts  lofty.ts  prisma.ts  reve-system-prompt.ts
rpr.ts  sendgrid.ts  settings.ts  twilio.ts
```

---

═══════════════════════════════════════════
## SECTION 5 — KEY FILES (verbatim)
═══════════════════════════════════════════

### src/lib/settings.ts

```ts
import { prisma } from "./prisma";

const _cache: Record<string, string> = {};

export async function getSetting(key: string): Promise<string | null> {
  if (_cache[key]) return _cache[key];

  // DB first, then env var
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  const value = row?.value || process.env[key] || null;

  if (value) _cache[key] = value;
  return value;
}

export async function getParagonConfig() {
  const [url, key] = await Promise.all([
    getSetting("PARAGON_API_URL"),
    getSetting("PARAGON_API_KEY"),
  ]);
  if (!url || !key) return null;
  return { url, key };
}

export async function getMetaConfig() {
  const [token, pageId, igId] = await Promise.all([
    getSetting("META_PAGE_ACCESS_TOKEN"),
    getSetting("META_PAGE_ID"),
    getSetting("META_IG_BUSINESS_ID"),
  ]);
  if (!token || !pageId) return null;
  return { token, pageId, igId };
}
```

> **Note:** The cache is a permanent in-memory `Record` — once a value is read it is never invalidated for the lifetime of the Node process. New values saved via `/api/settings` POST will not be picked up until server restart. This is a known footgun.

### src/lib/google.ts

```ts
import { prisma } from "./prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_PEOPLE_URL = "https://people.googleapis.com/v1/people/me/connections";
const SCOPES = "https://www.googleapis.com/auth/contacts.readonly";

export function getGoogleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getGoogleAuthUrl(clientId: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string, clientId: string, clientSecret: string, redirectUri: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString(),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function refreshGoogleToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }).toString(),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function getValidGoogleToken(): Promise<string | null> {
  const [accessRow, refreshRow, expiryRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "GOOGLE_ACCESS_TOKEN" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_REFRESH_TOKEN" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_TOKEN_EXPIRY" } }),
  ]);

  if (!refreshRow?.value) return null;

  const expiry = expiryRow ? parseInt(expiryRow.value) : 0;
  const needsRefresh = Date.now() > expiry - 60_000;

  if (!needsRefresh && accessRow?.value) return accessRow.value;

  const creds = getGoogleCredentials();
  if (!creds) return null;

  const tokens = await refreshGoogleToken(refreshRow.value, creds.clientId, creds.clientSecret);
  const newExpiry = Date.now() + tokens.expires_in * 1000;

  await Promise.all([
    prisma.setting.upsert({ where: { key: "GOOGLE_ACCESS_TOKEN" }, update: { value: tokens.access_token }, create: { key: "GOOGLE_ACCESS_TOKEN", value: tokens.access_token } }),
    prisma.setting.upsert({ where: { key: "GOOGLE_TOKEN_EXPIRY" }, update: { value: String(newExpiry) }, create: { key: "GOOGLE_TOKEN_EXPIRY", value: String(newExpiry) } }),
  ]);

  return tokens.access_token;
}

export interface GoogleContact {
  resourceName: string;
  names?: { displayName: string; givenName?: string; familyName?: string }[];
  emailAddresses?: { value: string }[];
  phoneNumbers?: { value: string; canonicalForm?: string }[];
  organizations?: { name?: string; title?: string }[];
  addresses?: { formattedValue?: string }[];
}

export async function fetchAllGoogleContacts(accessToken: string): Promise<GoogleContact[]> {
  const all: GoogleContact[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      personFields: "names,emailAddresses,phoneNumbers,organizations,addresses",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${GOOGLE_PEOPLE_URL}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Google People API error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { connections?: GoogleContact[]; nextPageToken?: string };
    all.push(...(data.connections ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return all;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export function mapGoogleContact(c: GoogleContact) {
  const name = c.names?.[0];
  const email = c.emailAddresses?.[0]?.value?.toLowerCase().trim();
  const rawPhone = c.phoneNumbers?.[0]?.canonicalForm ?? c.phoneNumbers?.[0]?.value ?? "";
  const phone = rawPhone ? normalizePhone(rawPhone) : undefined;
  const org = c.organizations?.[0];

  return {
    name: name?.displayName || "Unknown",
    firstName: name?.givenName || undefined,
    lastName: name?.familyName || undefined,
    email: email || undefined,
    phone: phone || undefined,
    source: "Google Contacts",
    notes: org?.name ? `${org.name}${org.title ? ` — ${org.title}` : ""}` : undefined,
  };
}
```

> **Live gap:** `SCOPES` hard-codes only `contacts.readonly`. The OAuth URL built by `getGoogleAuthUrl()` does not include Calendar scope, but `src/lib/google-calendar.ts` defines `CALENDAR_SCOPE` and expects to use it. To enable Calendar, the scope string needs to be a space-delimited combination and the user must re-consent.

### src/lib/google-calendar.ts

```ts
import { prisma } from "./prisma";
import { refreshGoogleToken } from "./google";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  allDay: boolean;
}

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || process.env[key] || null;
}

async function getValidToken(): Promise<string | null> {
  const [accessRow, refreshRow, expiryRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "GOOGLE_ACCESS_TOKEN" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_REFRESH_TOKEN" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_TOKEN_EXPIRY" } }),
  ]);

  if (!refreshRow?.value) return null;

  const expiry = expiryRow ? parseInt(expiryRow.value) : 0;
  if (Date.now() < expiry - 60_000 && accessRow?.value) return accessRow.value;

  const [clientId, clientSecret] = await Promise.all([
    getSetting("GOOGLE_CLIENT_ID"),
    getSetting("GOOGLE_CLIENT_SECRET"),
  ]);
  if (!clientId || !clientSecret) return null;

  try {
    const tokens = await refreshGoogleToken(refreshRow.value, clientId, clientSecret);
    const newExpiry = Date.now() + tokens.expires_in * 1000;
    await Promise.all([
      prisma.setting.upsert({ where: { key: "GOOGLE_ACCESS_TOKEN" }, update: { value: tokens.access_token }, create: { key: "GOOGLE_ACCESS_TOKEN", value: tokens.access_token } }),
      prisma.setting.upsert({ where: { key: "GOOGLE_TOKEN_EXPIRY" }, update: { value: String(newExpiry) }, create: { key: "GOOGLE_TOKEN_EXPIRY", value: String(newExpiry) } }),
    ]);
    return tokens.access_token;
  } catch {
    return null;
  }
}

export async function fetchUpcomingEvents(days = 7): Promise<CalendarEvent[]> {
  const token = await getValidToken();
  if (!token) return [];

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();

  const params = new URLSearchParams({
    timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "20",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }
  );

  if (!res.ok) return [];

  const data = await res.json() as { items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string; description?: string }[] };

  return (data.items ?? []).map(e => ({
    id: e.id,
    title: e.summary ?? "Untitled",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location,
    description: e.description,
    allDay: !e.start?.dateTime,
  }));
}
```

### src/lib/error-memory.ts

```ts
/**
 * AIRE Error Memory System — Karpathy-style correction loops
 *
 * Inspired by nanoGPT's training loop principles:
 *   - Every failure is logged with full attribution (what caused it)
 *   - Patterns are detected across error history (loss spikes → systematic issue)
 *   - Corrections are tracked to completion (did the fix actually work?)
 *   - Only errors with >2% recurrence rate trigger auto-intervention
 *   - Exponential backoff on retries (gradient clipping equivalent)
 */

import { prisma } from "./prisma";

export type ErrorType = "api_failure" | "validation" | "sync" | "ui" | "ai" | "lofty" | "paragon" | "meta";

export interface ErrorContext {
  route?: string;
  method?: string;
  leadId?: string;
  statusCode?: number;
  requestBody?: unknown;
  userId?: string;
  [key: string]: unknown;
}

export async function logError(
  type: ErrorType,
  source: string,
  error: unknown,
  context?: ErrorContext
): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  try {
    const log = await prisma.errorLog.create({
      data: {
        type,
        source,
        message,
        stack: stack?.slice(0, 2000) ?? null,
        context: context ? JSON.stringify(context) : null,
      },
    });
    return log.id;
  } catch {
    console.error("[error-memory] Failed to log error:", message);
    return "log-failed";
  }
}

export async function resolveError(id: string, resolution: string) {
  if (id === "log-failed") return;
  try {
    await prisma.errorLog.update({
      where: { id },
      data: { resolved: true, resolution, resolvedAt: new Date() },
    });
  } catch {}
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxAttempts?: number;
    source: string;
    type?: ErrorType;
    context?: ErrorContext;
    onRetry?: (attempt: number, error: unknown) => void;
  }
): Promise<T> {
  const { maxAttempts = 3, source, type = "api_failure", context } = opts;
  let lastError: unknown;
  let errorId: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (errorId) {
        await resolveError(errorId, `Auto-resolved on attempt ${attempt}`);
      }
      return result;
    } catch (err) {
      lastError = err;
      opts.onRetry?.(attempt, err);

      if (attempt === 1) {
        errorId = await logError(type, source, err, { ...context, attempt });
      } else {
        if (errorId && errorId !== "log-failed") {
          try {
            await prisma.errorLog.update({
              where: { id: errorId },
              data: { attempts: attempt },
            });
          } catch {}
        }
      }

      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, Math.min(500 * Math.pow(2, attempt - 1), 4000)));
      }
    }
  }

  throw lastError;
}

export async function detectPatterns(): Promise<Pattern[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const errors = await prisma.errorLog.findMany({
    where: { createdAt: { gte: since }, resolved: false },
    orderBy: { createdAt: "desc" },
  });

  const grouped = new Map<string, typeof errors>();
  for (const e of errors) {
    const key = `${e.type}::${e.source}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  const patterns: Pattern[] = [];
  for (const [key, group] of grouped) {
    if (group.length >= 2) {
      const [type, source] = key.split("::");
      const recentMessage = group[0].message;
      patterns.push({
        type: type as ErrorType,
        source,
        count: group.length,
        firstSeen: group[group.length - 1].createdAt.toISOString(),
        lastSeen: group[0].createdAt.toISOString(),
        message: recentMessage,
        errorIds: group.map(e => e.id),
        severity: group.length >= 10 ? "critical" : group.length >= 5 ? "high" : "medium",
      });
    }
  }
  return patterns.sort((a, b) => b.count - a.count);
}

export interface Pattern {
  type: ErrorType;
  source: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  message: string;
  errorIds: string[];
  severity: "critical" | "high" | "medium";
}

export async function getHealthScore(): Promise<{
  score: number;
  trend: "improving" | "stable" | "degrading";
  summary: string;
}> {
  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const prev24h = new Date(now - 48 * 60 * 60 * 1000);

  const [recentErrors, prevErrors, recentResolved] = await Promise.all([
    prisma.errorLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.errorLog.count({ where: { createdAt: { gte: prev24h, lt: last24h } } }),
    prisma.errorLog.count({ where: { createdAt: { gte: last24h }, resolved: true } }),
  ]);

  const unresolved = recentErrors - recentResolved;
  const score = Math.max(0, Math.min(100, 100 - (unresolved * 5)));

  const trend = recentErrors < prevErrors
    ? "improving"
    : recentErrors > prevErrors * 1.1
    ? "degrading"
    : "stable";

  const summary = unresolved === 0
    ? "All systems nominal"
    : `${unresolved} unresolved error${unresolved > 1 ? "s" : ""} in last 24h`;

  return { score, trend, summary };
}

export function withErrorMemory(
  handler: (req: Request, ctx?: unknown) => Promise<Response>,
  source: string,
  type: ErrorType = "api_failure"
) {
  return async (req: Request, ctx?: unknown): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      await logError(type, source, err, { route: source, method: req.method });
      const message = err instanceof Error ? err.message : "Internal server error";
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
```

### src/lib/lofty.ts (representative integration pattern)

```ts
const LOFTY_BASE = "https://api.lofty.com";
const LOFTY_TOKEN_URL = "https://api.lofty.com/oauth/token";

let _cachedToken: { accessToken: string; expiresAt: number } | null = null;

export interface LoftyCredentials {
  clientId: string;
  clientSecret: string;
  customerKey: string;
}

export function getLoftyCredentials(): LoftyCredentials | null {
  const clientId = process.env.LOFTY_CLIENT_ID?.trim();
  const clientSecret = process.env.LOFTY_CLIENT_SECRET?.trim();
  const customerKey = (process.env.LOFTY_CUSTOMER_KEY ?? process.env.LOFTY_API_KEY)?.trim();
  if (!clientId || !clientSecret || !customerKey) return null;
  return { clientId, clientSecret, customerKey };
}

export async function getLoftyAccessToken(creds: LoftyCredentials): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.accessToken;
  }

  const res = await fetch(LOFTY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      customer_key: creds.customerKey,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Lofty OAuth failed (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresIn = data.expires_in ?? 3600;
  _cachedToken = { accessToken: data.access_token, expiresAt: now + expiresIn * 1000 };
  return data.access_token;
}

// ... (LoftyLead/LoftyResponse interfaces, fetchLoftyPage, fetchAllLoftyLeads,
// STAGE_MAP, mapLoftyLeadToAire — full source in src/lib/lofty.ts)
```

> **Pattern in use:** module-level token cache, `AbortSignal.timeout()` everywhere, narrow typed responses, descriptive error messages with remediation hints. Credentials currently read from `process.env` only — does NOT route through `src/lib/settings.ts` like the newer integrations do. This is an inconsistency: `lofty.ts` and `google.ts` use `process.env`, while `twilio.ts`/`sendgrid.ts`/`calendly.ts`/`dotloop.ts`/`rpr.ts` and the helpers in `settings.ts` use DB-first-then-env.

### src/app/api/auth/google/route.ts

```ts
import { NextRequest } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const [idRow, secretRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "GOOGLE_CLIENT_ID" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_CLIENT_SECRET" } }),
  ]);

  const clientId = idRow?.value || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = secretRow?.value || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.json({ error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set. Add them in Settings." }, { status: 503 });
  }

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const url = getGoogleAuthUrl(clientId, redirectUri);

  return Response.redirect(url);
}
```

### src/app/api/auth/google/callback/route.ts

```ts
import { NextRequest } from "next/server";
import { exchangeGoogleCode } from "@/lib/google";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return Response.redirect(`${origin}/settings?google=denied`);
  }

  const [idRow, secretRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "GOOGLE_CLIENT_ID" } }),
    prisma.setting.findUnique({ where: { key: "GOOGLE_CLIENT_SECRET" } }),
  ]);
  const clientId = idRow?.value || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = secretRow?.value || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.redirect(`${origin}/settings?google=no_creds`);
  }
  const creds = { clientId, clientSecret };

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokens = await exchangeGoogleCode(code, creds.clientId, creds.clientSecret, redirectUri);
    const expiry = Date.now() + tokens.expires_in * 1000;

    const saves = [
      prisma.setting.upsert({ where: { key: "GOOGLE_ACCESS_TOKEN" }, update: { value: tokens.access_token }, create: { key: "GOOGLE_ACCESS_TOKEN", value: tokens.access_token } }),
      prisma.setting.upsert({ where: { key: "GOOGLE_TOKEN_EXPIRY" }, update: { value: String(expiry) }, create: { key: "GOOGLE_TOKEN_EXPIRY", value: String(expiry) } }),
    ];

    if (tokens.refresh_token) {
      saves.push(prisma.setting.upsert({ where: { key: "GOOGLE_REFRESH_TOKEN" }, update: { value: tokens.refresh_token }, create: { key: "GOOGLE_REFRESH_TOKEN", value: tokens.refresh_token } }));
    }

    await Promise.all(saves);
    return Response.redirect(`${origin}/settings?google=connected`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Google OAuth]", msg);
    return Response.redirect(`${origin}/settings?google=error`);
  }
}
```

---

═══════════════════════════════════════════
## SECTION 6 — INCOMPLETE WORK
═══════════════════════════════════════════

### TODO/FIXME/HACK/XXX grep across src/

_No occurrences of TODO, FIXME, HACK, or XXX comments in any `.ts` or `.tsx` source file._

(All matches for the word "placeholder" were React input placeholder attributes for the UI — not code TODOs. Omitted.)

### Files containing "stub"

_No source files contain the word "stub"._

### Known gaps (manually identified during scan)

1. **`src/lib/google.ts` SCOPES** is hard-coded to `contacts.readonly`. Calendar will not work until Calendar scope is added and the user re-consents.
2. **`src/lib/settings.ts` cache** never invalidates — values saved via UI require a server restart to be picked up by any caller that hits the cache first.
3. **Two `dev.db` files** — root and `prisma/`. Live DB is `prisma/dev.db`. Root one is stale.
4. **`src/app/api/smartplans/`** is an empty directory — typo dupe of `smart-plans/`. Dead.
5. **`@clerk/nextjs`** is in `package.json` but has zero imports anywhere in `src/`. Dead dep.
6. **Credential-source inconsistency:** `lofty.ts` and `google.ts` read only from `process.env`. All newer integration libs read DB-first via `getSetting()`. Lofty/Google won't see values saved through the Settings UI unless they're also in `.env`.
7. **`.env.example`** does not exist.

---

═══════════════════════════════════════════
## SECTION 7 — RECENT ACTIVITY
═══════════════════════════════════════════

### git log --oneline -30

```
60e20ed Initial commit from Create Next App
```

_(Only one commit in repo history — the initial Next.js scaffold. All AIRE work is uncommitted.)_

### git status

```
On branch main
Changes not staged for commit:
	modified:   .gitignore
	modified:   CLAUDE.md
	modified:   package-lock.json
	modified:   package.json
	modified:   src/app/globals.css
	modified:   src/app/layout.tsx
	modified:   src/app/page.tsx

Untracked files:
	.claude/
	dev.db
	prisma.config.ts
	prisma/
	src/app/api/
	src/app/apps/
	src/app/buyers/
	src/app/contacts/
	src/app/create-post/
	src/app/crm/
	src/app/import/
	src/app/mls/
	src/app/pipeline/
	src/app/settings/
	src/app/smart-plans/
	src/app/social/
	src/app/system/
	src/components/
	src/lib/
```

> **Heads-up:** The entire AIRE codebase (every API route, every page, every lib file, the Prisma schema, all migrations) is **untracked**. A single `rm -rf` would lose everything. This is the highest-priority risk in the repo right now.

---

═══════════════════════════════════════════
## SECTION 8 — ENVIRONMENT
═══════════════════════════════════════════

### Key names in `.env` (values NOT included)

```
DATABASE_URL
ANTHROPIC_API_KEY
LOFTY_CLIENT_ID
LOFTY_CLIENT_SECRET
LOFTY_CUSTOMER_KEY
```

### `.env.example`

_File does not exist._

### Additional credential keys the app reads from DB Settings table (per `settings.ts` and per-integration libs)

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_ACCESS_TOKEN        (written by OAuth callback)
GOOGLE_REFRESH_TOKEN       (written by OAuth callback)
GOOGLE_TOKEN_EXPIRY        (written by OAuth callback)
PARAGON_API_URL
PARAGON_API_KEY
META_PAGE_ACCESS_TOKEN
META_PAGE_ID
META_IG_BUSINESS_ID
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
CALENDLY_API_KEY
DOTLOOP_ACCESS_TOKEN
DOTLOOP_PROFILE_ID
ZAPIER_WEBHOOK_URL
RPR_USERNAME
RPR_PASSWORD
```

---

## Redaction pass

Pass complete. **0 redactions made** — no API keys, tokens, emails, phone numbers, or DB connection strings were present in any of the captured content. All `.env` values were excluded by design (only key names emitted). The strings appearing in `src/app/settings/page.tsx` (e.g. `EAAxxxxxxxxx...`, `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`, `GOCSPX-xxxxxxxxxx`) are React input `placeholder` props — instructional examples, not real credentials.

File written to: `/Users/caleb/aire-platform/integrations/_PROJECT_BRIEFING.md`
