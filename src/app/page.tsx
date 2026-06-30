import MissionControl from "@/components/MissionControl";

// "/" is the Home of Caleb OS — Mission Control (Sprint 1, 2026-06-29).
// The previous dashboard is preserved verbatim in components/Cockpit.tsx;
// to roll back, render <Cockpit/> here instead.
export default function Home() {
  return <MissionControl />;
}
