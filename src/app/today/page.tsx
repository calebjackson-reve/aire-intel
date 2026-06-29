import { permanentRedirect } from 'next/navigation'

// /today → / (Mission Control) — Phase 1 route consolidation
export default function TodayRedirect() {
  permanentRedirect('/')
}
