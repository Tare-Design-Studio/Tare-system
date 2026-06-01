"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Project, Engineer, MaterialPlan, Expense, CheckIn, SiteVisit } from "./components/shared";
import type { FeedUpdate } from "@/components/updates/UpdatesFeed";
import { DesktopSiteEngineer } from "./components/DesktopSiteEngineer";
import { MobileSiteEngineer } from "./components/MobileSiteEngineer";

type Props = {
  engineer: Engineer;
  projects: Project[];
  nowMs: number;
  siteVisits: SiteVisit[];
};

export default function SiteEngineerDashboard({ engineer, projects, nowMs, siteVisits }: Props) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [tab, setTab] = useState("today");

  // "Details" is not a tab panel — it routes to the shared owner project page
  // so site engineers see the exact same project details view.
  const handleTab = (next: string) => {
    if (next === "details") {
      if (projectId) router.push(`/projects/${projectId}`);
      return;
    }
    if (next === "bridge") {
      router.push("/bridge");
      return;
    }
    setTab(next);
  };
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

  // Load on mount and project switch
  useState(() => { refresh(projectId); });

  const switchProject = (pid: string) => {
    setProjectId(pid);
    refresh(pid);
  };

  return (
    <>
      <div className="desktop-only">
        <DesktopSiteEngineer
          engineer={engineer}
          project={project}
          projects={projects}
          projectId={projectId}
          nowMs={nowMs}
          tab={tab}
          plans={plans}
          expenses={expenses}
          checkIns={checkIns}
          updates={updates}
          loading={loading}
          siteVisits={siteVisits}
          switchProject={switchProject}
          setTab={handleTab}
          refresh={() => refresh(projectId)}
        />
      </div>
      <div className="mobile-only">
        <MobileSiteEngineer
          engineer={engineer}
          project={project}
          projects={projects}
          projectId={projectId}
          nowMs={nowMs}
          tab={tab}
          plans={plans}
          expenses={expenses}
          checkIns={checkIns}
          updates={updates}
          loading={loading}
          siteVisits={siteVisits}
          switchProject={switchProject}
          setTab={handleTab}
          refresh={() => refresh(projectId)}
        />
      </div>
    </>
  );
}
