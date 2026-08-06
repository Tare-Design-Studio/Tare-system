"use client";

import { useState, useCallback, useEffect } from "react";
import { Project, Engineer, MaterialPlan, Expense, CheckIn, SiteVisit } from "./components/shared";
import type { FeedUpdate } from "@/components/updates/UpdatesFeed";
import { DesktopSiteEngineer } from "./components/DesktopSiteEngineer";
import { MobileSiteEngineer } from "./components/MobileSiteEngineer";

type Props = {
  engineer: Engineer;
  projects: Project[];
  nowMs: number;
  siteVisits: SiteVisit[];
  // Tab and project both come from the URL — the layout chrome drives them.
  tab: string;
  projectId: string;
};

export default function SiteEngineerDashboard({ engineer, projects, nowMs, siteVisits, tab, projectId }: Props) {
  const [plans, setPlans] = useState<MaterialPlan[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [updates, setUpdates] = useState<FeedUpdate[]>([]);
  const [loading, setLoading] = useState(false);

  const project = projects.find(p => p.id === projectId);

  const refresh = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    try {
      const [matRes, expRes, ciRes, updRes] = await Promise.all([
        fetch(`/api/projects/${pid}/materials`).then(r => r.json()),
        fetch(`/api/projects/${pid}/expenses`).then(r => r.json()),
        fetch(`/api/projects/${pid}/checkin`).then(r => r.json()),
        fetch(`/api/projects/${pid}/updates`).then(r => r.json()),
      ]);
      setPlans(matRes.plans ?? []);
      setExpenses(expRes.expenses ?? []);
      setCheckIns(ciRes.check_ins ?? []);
      setUpdates(updRes.updates ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount and whenever the chrome switches project. The await defers
  // refresh past the synchronous effect body so no setState runs inline.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) refresh(projectId);
    })();
    return () => { cancelled = true; };
  }, [projectId, refresh]);

  return (
    <>
      <div className="desktop-only">
        <DesktopSiteEngineer
          engineer={engineer}
          project={project}
          projects={projects}
          nowMs={nowMs}
          tab={tab}
          plans={plans}
          expenses={expenses}
          checkIns={checkIns}
          updates={updates}
          loading={loading}
          siteVisits={siteVisits}
          refresh={() => refresh(projectId)}
        />
      </div>
      <div className="mobile-only">
        <MobileSiteEngineer
          engineer={engineer}
          project={project}
          projects={projects}
          nowMs={nowMs}
          tab={tab}
          plans={plans}
          expenses={expenses}
          checkIns={checkIns}
          updates={updates}
          siteVisits={siteVisits}
          refresh={() => refresh(projectId)}
        />
      </div>
    </>
  );
}
