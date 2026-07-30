"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { WorkRail } from "@/components/work/work-rail";
import { WorkSessionView } from "@/components/work/work-session-view";
import { WorkProjectBar } from "@/components/work/work-project-bar";
import { WorkProjectDialog } from "@/components/work/work-project-dialog";
import {
  createWorkSession,
  deleteWorkProject,
  deleteWorkSession,
} from "@/lib/actions/work-actions";
import type { WorkSessionDetail } from "@/lib/work-queries";
import type {
  WorkBundleSummary,
  WorkProject,
  WorkSession,
} from "@/lib/work-types";

const RAIL_KEY = "retroz.work.rail";
const CANVAS_KEY = "retroz.work.canvas";

/** Below these widths the side panels start hidden, before any stored choice. */
const RAIL_MIN_WIDTH = 1024;
const CANVAS_MIN_WIDTH = 1320;

function readPanelPref(key: string, minWidth: number): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "0") return true;
    if (stored === "1") return false;
  } catch {
    // storage unavailable — fall through to the width heuristic
  }
  return window.innerWidth < minWidth;
}

function writePanelPref(key: string, hidden: boolean) {
  try {
    localStorage.setItem(key, hidden ? "0" : "1");
  } catch {
    // storage unavailable — panel state simply won't persist
  }
}

/**
 * Client shell for Work: owns which project the rail is showing and whether the
 * side panels are open. The conversation and canvas live in a keyed child so
 * every session switch starts from clean local state.
 */
export function WorkWorkspace({
  projects,
  sessions,
  workflows,
  bundles,
  detail,
  researchAvailable,
}: {
  projects: WorkProject[];
  sessions: WorkSession[];
  workflows: { id: string; name: string }[];
  /** Bundles of the open session's project, for the canvas's collect action. */
  bundles: WorkBundleSummary[];
  detail: WorkSessionDetail | null;
  /** False when no Tavily key is saved — the composer hides the picker. */
  researchAvailable: boolean;
}) {
  const router = useRouter();
  const [projectDialog, setProjectDialog] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [pickedProjectId, setPickedProjectId] = React.useState<string | null>(
    null,
  );

  const [railHidden, setRailHidden] = React.useState(false);
  const [canvasHidden, setCanvasHidden] = React.useState(false);

  React.useEffect(() => {
    setRailHidden(readPanelPref(RAIL_KEY, RAIL_MIN_WIDTH));
    setCanvasHidden(readPanelPref(CANVAS_KEY, CANVAS_MIN_WIDTH));
  }, []);

  // The open session decides the project unless the user picked another one.
  const activeProjectId =
    pickedProjectId ?? detail?.projectId ?? projects[0]?.id ?? null;
  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  function togglePanel(which: "rail" | "canvas", hidden: boolean) {
    if (which === "rail") {
      setRailHidden(hidden);
      writePanelPref(RAIL_KEY, hidden);
    } else {
      setCanvasHidden(hidden);
      writePanelPref(CANVAS_KEY, hidden);
    }
  }

  function selectProject(id: string) {
    setPickedProjectId(id);
    const first = sessions.find((s) => s.projectId === id);
    if (first) router.push(`/work/${first.id}`);
  }

  async function newSession() {
    if (!activeProject || creating) {
      if (!activeProject) setProjectDialog(true);
      return;
    }
    setCreating(true);
    try {
      const session = await createWorkSession({ projectId: activeProject.id });
      setPickedProjectId(activeProject.id);
      router.push(`/work/${session.id}`);
    } finally {
      setCreating(false);
    }
  }

  /** After a delete, land on whatever session is still standing. */
  function goAfterDelete(removed: (s: WorkSession) => boolean) {
    const next = sessions.find((s) => !removed(s));
    router.replace(next ? `/work/${next.id}` : "/work");
    router.refresh();
  }

  async function removeProject(id: string) {
    await deleteWorkProject(id);
    if (pickedProjectId === id) setPickedProjectId(null);
    goAfterDelete((s) => s.projectId === id);
  }

  async function removeSession(id: string) {
    await deleteWorkSession(id);
    goAfterDelete((s) => s.id === id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkProjectBar
        projects={projects}
        activeProjectId={activeProjectId}
        chatSessionId={detail?.id ?? null}
        tab="chat"
        workflows={workflows}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {railHidden ? null : (
          <WorkRail
            projects={projects}
            sessions={sessions}
            activeProjectId={activeProjectId}
            activeSessionId={detail?.id ?? null}
            busy={creating}
            onSelectProject={selectProject}
            onSelectSession={(id) => router.push(`/work/${id}`)}
            onNewSession={newSession}
            onNewProject={() => setProjectDialog(true)}
            onDeleteProject={removeProject}
            onDeleteSession={removeSession}
            onCollapse={() => togglePanel("rail", true)}
          />
        )}

        <WorkSessionView
          key={detail?.id ?? "empty"}
          detail={detail}
          projectId={activeProject?.id ?? null}
          projectName={activeProject?.name ?? "Work"}
          bundles={bundles}
          hasProjects={projects.length > 0}
          railHidden={railHidden}
          canvasHidden={canvasHidden}
          onShowRail={() => togglePanel("rail", false)}
          onShowCanvas={() => togglePanel("canvas", false)}
          onHideCanvas={() => togglePanel("canvas", true)}
          onNewProject={() => setProjectDialog(true)}
          onNewSession={newSession}
          researchAvailable={researchAvailable}
        />
      </div>

      <WorkProjectDialog
        workflows={workflows}
        open={projectDialog}
        onOpenChange={setProjectDialog}
      />
    </div>
  );
}
