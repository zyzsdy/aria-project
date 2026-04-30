import { describe, expect, it } from "vitest";
import type { ProjectTab, ProjectWorkspace } from "@aria/types";
import {
  addSessionTabToActivePane,
  clampSplitRatio,
  closeProjectTab,
  createEmptyProjectWorkspace,
  openHtmlTabInActiveProject,
  selectProject,
  selectProjectTab,
  splitActivePane,
  updateProjectLayout
} from "./projectLayoutState";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("project layout state", () => {
  it("creates one active default project with one empty pane", () => {
    const workspace = createEmptyProjectWorkspace();

    expect(workspace.projects).toHaveLength(1);
    expect(workspace.projects[0].projectId).toBe(workspace.activeProjectId);
    expect(workspace.projects[0].layout.type).toBe("leaf");
  });

  it("switches active projects without mutating their pane layouts", () => {
    const workspace = createEmptyProjectWorkspace();
    const second = {
      ...workspace.projects[0],
      projectId: "project-two",
      name: "Two"
    };

    const next = selectProject(
      { activeProjectId: workspace.activeProjectId, projects: [...workspace.projects, second] },
      "project-two"
    );

    expect(next.activeProjectId).toBe("project-two");
    expect(next.projects[0].layout).toEqual(workspace.projects[0].layout);
  });

  it("adds selected sessions as tabs to the active pane", () => {
    const workspace = createEmptyProjectWorkspace();
    const next = addSessionTabToActivePane(workspace, {
      sessionId: "session-a",
      title: "PowerShell"
    });
    const activeProject = next.projects[0];

    expect(activeProject.layout.type).toBe("leaf");
    if (activeProject.layout.type !== "leaf") {
      return;
    }
    expect(activeProject.layout.tabs).toEqual([
      expect.objectContaining({ kind: "terminal", sessionId: "session-a", title: "PowerShell" })
    ]);
    expect(activeProject.layout.activeTabId).toBe(activeProject.layout.tabs[0].tabId);
  });

  it("generates UUID ids that can be sent to the Rust project layout API", () => {
    const workspace = addSessionTabToActivePane(createEmptyProjectWorkspace(), {
      sessionId: "session-a",
      title: "PowerShell"
    });
    const project = workspace.projects[0];

    expect(project.projectId).toMatch(UUID_PATTERN);
    expect(project.activePaneId).toMatch(UUID_PATTERN);
    expect(project.layout.type).toBe("leaf");
    if (project.layout.type !== "leaf") {
      return;
    }

    expect(project.layout.paneId).toMatch(UUID_PATTERN);
    expect(project.layout.activeTabId).toMatch(UUID_PATTERN);
    expect(project.layout.tabs[0].tabId).toMatch(UUID_PATTERN);
  });

  it("generates UUID ids for split panes", () => {
    const workspace = splitActivePane(createEmptyProjectWorkspace(), "horizontal");
    const project = workspace.projects[0];

    expect(project.layout.type).toBe("split");
    if (project.layout.type !== "split") {
      return;
    }

    expect(project.layout.splitId).toMatch(UUID_PATTERN);
    expect(project.layout.second.type).toBe("leaf");
    if (project.layout.second.type !== "leaf") {
      return;
    }
    expect(project.layout.second.paneId).toMatch(UUID_PATTERN);
  });

  it("activates an existing html tab anywhere in the active project", () => {
    const workspace = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-a",
      firstTabs: [],
      firstActiveTabId: null,
      secondTabs: [
        {
          kind: "html",
          pageId: "settings",
          sessionId: null,
          tabId: "settings-tab",
          title: "Settings"
        }
      ],
      secondActiveTabId: null
    });

    const next = openHtmlTabInActiveProject(workspace, "settings", "Settings");
    const project = next.projects[0];

    expect(project.activePaneId).toBe("pane-b");
    expect(project.layout.type).toBe("split");
    if (project.layout.type === "split" && project.layout.second.type === "leaf") {
      expect(project.layout.second.activeTabId).toBe("settings-tab");
      expect(project.layout.second.tabs).toHaveLength(1);
    }
  });

  it("opens an html tab in the active pane when the active project does not have one", () => {
    const workspace = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-a",
      firstTabs: [],
      firstActiveTabId: null,
      secondTabs: [],
      secondActiveTabId: null
    });

    const next = openHtmlTabInActiveProject(workspace, "settings", "Settings");
    const project = next.projects[0];

    expect(project.activePaneId).toBe("pane-a");
    expect(project.layout.type).toBe("split");
    if (project.layout.type === "split" && project.layout.first.type === "leaf") {
      expect(project.layout.first.tabs).toEqual([
        expect.objectContaining({
          kind: "html",
          pageId: "settings",
          sessionId: null,
          title: "Settings"
        })
      ]);
      expect(project.layout.first.activeTabId).toBe(project.layout.first.tabs[0].tabId);
    }
  });

  it("does not reuse html tabs from inactive projects", () => {
    const activeProject = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-a",
      firstTabs: [],
      firstActiveTabId: null,
      secondTabs: [],
      secondActiveTabId: null
    }).projects[0];
    const inactiveProject = createWorkspaceWithSplit({
      activeProjectId: "project-b",
      activePaneId: "pane-c",
      firstPaneId: "pane-c",
      secondPaneId: "pane-d",
      firstTabs: [
        {
          kind: "html",
          pageId: "settings",
          sessionId: null,
          tabId: "inactive-settings",
          title: "Settings"
        }
      ],
      firstActiveTabId: "inactive-settings",
      secondTabs: [],
      secondActiveTabId: null
    }).projects[0];

    const next = openHtmlTabInActiveProject(
      {
        activeProjectId: "project-a",
        projects: [activeProject, { ...inactiveProject, projectId: "project-b" }]
      },
      "settings",
      "Settings"
    );

    expect(next.activeProjectId).toBe("project-a");
    expect(next.projects[0].activePaneId).toBe("pane-a");
    expect(next.projects[1].layout).toEqual(inactiveProject.layout);
    expect(next.projects[0].layout.type).toBe("split");
    if (next.projects[0].layout.type === "split" && next.projects[0].layout.first.type === "leaf") {
      expect(next.projects[0].layout.first.tabs).toEqual([
        expect.objectContaining({ kind: "html", pageId: "settings" })
      ]);
    }
  });

  it("keeps stale session tabs as unavailable placeholders when closing tabs", () => {
    const workspace = addSessionTabToActivePane(createEmptyProjectWorkspace(), {
      sessionId: "missing-session",
      title: "Old Shell"
    });
    const tabId =
      workspace.projects[0].layout.type === "leaf" ? workspace.projects[0].layout.tabs[0].tabId : "";

    const selected = selectProjectTab(workspace, workspace.projects[0].activePaneId, tabId);
    const closed = closeProjectTab(selected, workspace.projects[0].activePaneId, "not-this-tab");

    expect(closed).toEqual(selected);
  });

  it("updates a project layout and clamps split ratios", () => {
    const workspace = createEmptyProjectWorkspace();
    const project = workspace.projects[0];
    const updated = updateProjectLayout(workspace, project.projectId, {
      type: "split",
      splitId: "split-a",
      direction: "horizontal",
      ratio: 0.99,
      first: project.layout,
      second: {
        type: "leaf",
        paneId: "pane-b",
        activeTabId: null,
        tabs: []
      }
    });

    expect(clampSplitRatio(0.04)).toBe(0.15);
    expect(clampSplitRatio(0.96)).toBe(0.85);
    expect(updated.projects[0].layout.type).toBe("split");
    if (updated.projects[0].layout.type === "split") {
      expect(updated.projects[0].layout.ratio).toBe(0.85);
    }
  });
});

type CreateWorkspaceWithSplitOptions = {
  activeProjectId: string;
  activePaneId: string;
  firstPaneId?: string;
  secondPaneId?: string;
  firstTabs: ProjectTab[];
  firstActiveTabId: string | null;
  secondTabs: ProjectTab[];
  secondActiveTabId: string | null;
};

function createWorkspaceWithSplit({
  activeProjectId,
  activePaneId,
  firstPaneId = "pane-a",
  secondPaneId = "pane-b",
  firstTabs,
  firstActiveTabId,
  secondTabs,
  secondActiveTabId
}: CreateWorkspaceWithSplitOptions): ProjectWorkspace {
  return {
    activeProjectId,
    projects: [
      {
        projectId: activeProjectId,
        name: "Default Project",
        activePaneId,
        layout: {
          type: "split",
          splitId: "split-a",
          direction: "horizontal",
          ratio: 0.5,
          first: {
            type: "leaf",
            paneId: firstPaneId,
            activeTabId: firstActiveTabId,
            tabs: firstTabs
          },
          second: {
            type: "leaf",
            paneId: secondPaneId,
            activeTabId: secondActiveTabId,
            tabs: secondTabs
          }
        }
      }
    ]
  };
}
