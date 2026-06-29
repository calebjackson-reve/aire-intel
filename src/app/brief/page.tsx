import { permanentRedirect } from 'next/navigation'

// /brief → / (Mission Control) — Phase 1 route consolidation
export default function BriefRedirect() {
  permanentRedirect('/')
}
