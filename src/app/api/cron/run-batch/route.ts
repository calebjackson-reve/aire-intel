export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { type NextRequest } from 'next/server'
import { verifyCronSecret, verifyCronOrInternal, cronUnauthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'
import { seedCronRegistry } from '@/lib/cron-registry'

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get('authorization'))) return cronUnauthorized()
  return dispatch(request)
}

export async function GET(request: NextRequest) {
  if (!verifyCronOrInternal(request)) return cronUnauthorized()
  return dispatch(request)
}

async function dispatch(request: NextRequest) {
  const group = request.nextUrl.searchParams.get('group') ?? 'standard'

  // Auto-seed on first run
  const count = await prisma.cronTrigger.count()
  if (count === 0) await seedCronRegistry()

  const now = new Date()
  const triggers = await prisma.cronTrigger.findMany({ where: { group, enabled: true } })

  const due = triggers.filter(t =>
    !t.lastRunAt || now.getTime() - t.lastRunAt.getTime() >= t.intervalMs * 0.9
  )

  if (due.length === 0) {
    return Response.json({ group, fired: [], total: 0 })
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const secret = process.env.CRON_SECRET ?? ''

  // Mark all due jobs as "running" before firing to prevent double-dispatch
  await prisma.cronTrigger.updateMany({
    where: { id: { in: due.map(t => t.id) } },
    data: { lastRunAt: now },
  })

  const results = await Promise.allSettled(
    due.map(async t => {
      const res = await fetch(`${baseUrl}${t.path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${secret}` },
      })
      return { slug: t.slug, httpStatus: res.status }
    })
  )

  const fired = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { slug: due[i].slug, error: String((r as PromiseRejectedResult).reason) }
  )

  return Response.json({ group, fired, total: fired.length })
}
