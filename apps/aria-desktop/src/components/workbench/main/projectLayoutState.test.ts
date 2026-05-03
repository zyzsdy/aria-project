import { describe, expect, it } from "vitest";
import type { ProjectTab, ProjectWorkspace } from "@aria/types";
import {
  addSessionTabToActivePane,
  clampSplitRatio,
  closeProjectTab,
  createEmptyProjectWorkspace,
  openHtmlTabInActiveProject,
  moveProjectTab,
  selectProject,
  selectProjectTab,
  splitActivePane,
  splitPane,
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

  it("splits the requested pane even when another pane is active", () => {
    const workspace = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-a",
      firstTabs: [terminalTab("tab-a", "session-a")],
      firstActiveTabId: "tab-a",
      secondTabs: [terminalTab("tab-b", "session-b")],
      secondActiveTabId: "tab-b"
    });

    const next = splitPane(workspace, "pane-b", "vertical");
    const project = next.projects[0];

    expect(project.activePaneId).not.toBe("pane-a");
    expect(project.layout.type).toBe("split");
    if (project.layout.type !== "split" || project.layout.second.type !== "split") {
      throw new Error("expected pane-b to be replaced with a nested split");
    }

    expect(project.layout.first).toEqual({
      type: "leaf",
      paneId: "pane-a",
      activeTabId: "tab-a",
      tabs: [terminalTab("tab-a", "session-a")]
    });
    expect(project.layout.second.direction).toBe("vertical");
    expect(project.layout.second.first).toEqual({
      type: "leaf",
      paneId: "pane-b",
      activeTabId: "tab-b",
      tabs: [terminalTab("tab-b", "session-b")]
    });
    expect(project.layout.second.second.type).toBe("leaf");
    if (project.layout.second.second.type === "leaf") {
      expect(project.activePaneId).toBe(project.layout.second.second.paneId);
      expect(project.layout.second.second.tabs).toEqual([]);
    }
  });

  it("keeps splitActivePane focused on the active pane", () => {
    const workspace = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-a",
      firstTabs: [terminalTab("tab-a", "session-a")],
      firstActiveTabId: "tab-a",
      secondTabs: [terminalTab("tab-b", "session-b")],
      secondActiveTabId: "tab-b"
    });

    const next = splitActivePane(workspace, "horizontal");
    const project = next.projects[0];

    expect(project.layout.type).toBe("split");
    if (project.layout.type !== "split" || project.layout.first.type !== "split") {
      throw new Error("expected active pane-a to be replaced with a nested split");
    }

    expect(project.layout.first.direction).toBe("horizontal");
    expect(project.layout.second).toEqual({
      type: "leaf",
      paneId: "pane-b",
      activeTabId: "tab-b",
      tabs: [terminalTab("tab-b", "session-b")]
    });
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

  it("collapses a split when closing the only tab in one pane", () => {
    const workspace = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-b",
      firstTabs: [terminalTab("tab-a", "session-a")],
      firstActiveTabId: "tab-a",
      secondTabs: [terminalTab("tab-b", "session-b")],
      secondActiveTabId: "tab-b"
    });

    const next = closeProjectTab(workspace, "pane-b", "tab-b");
    const project = next.projects[0];

    expect(project.activePaneId).toBe("pane-a");
    expect(project.layout).toEqual({
      type: "leaf",
      paneId: "pane-a",
      activeTabId: "tab-a",
      tabs: [terminalTab("tab-a", "session-a")]
    });
  });

  it("collapses only the affected branch when closing the last tab in a nested pane", () => {
    const workspace: ProjectWorkspace = {
      activeProjectId: "project-a",
      projects: [
        {
          projectId: "project-a",
          name: "Default Project",
          activePaneId: "pane-c",
          layout: {
            type: "split",
            splitId: "split-root",
            direction: "horizontal",
            ratio: 0.4,
            first: {
              type: "leaf",
              paneId: "pane-a",
              activeTabId: "tab-a",
              tabs: [terminalTab("tab-a", "session-a")]
            },
            second: {
              type: "split",
              splitId: "split-nested",
              direction: "vertical",
              ratio: 0.5,
              first: {
                type: "leaf",
                paneId: "pane-b",
                activeTabId: "tab-b",
                tabs: [terminalTab("tab-b", "session-b")]
              },
              second: {
                type: "leaf",
                paneId: "pane-c",
                activeTabId: "tab-c",
                tabs: [terminalTab("tab-c", "session-c")]
              }
            }
          }
        }
      ]
    };

    const next = closeProjectTab(workspace, "pane-c", "tab-c");
    const project = next.projects[0];

    expect(project.activePaneId).toBe("pane-a");
    expect(project.layout).toEqual({
      type: "split",
      splitId: "split-root",
      direction: "horizontal",
      ratio: 0.4,
      first: {
        type: "leaf",
        paneId: "pane-a",
        activeTabId: "tab-a",
        tabs: [terminalTab("tab-a", "session-a")]
      },
      second: {
        type: "leaf",
        paneId: "pane-b",
        activeTabId: "tab-b",
        tabs: [terminalTab("tab-b", "session-b")]
      }
    });
  });

  it("keeps the pane when closing the only tab in the only pane", () => {
    const workspace: ProjectWorkspace = {
      activeProjectId: "project-a",
      projects: [
        {
          projectId: "project-a",
          name: "Default Project",
          activePaneId: "pane-a",
          layout: {
            type: "leaf",
            paneId: "pane-a",
            activeTabId: "tab-a",
            tabs: [terminalTab("tab-a", "session-a")]
          }
        }
      ]
    };

    const next = closeProjectTab(workspace, "pane-a", "tab-a");

    expect(next.projects[0].activePaneId).toBe("pane-a");
    expect(next.projects[0].layout).toEqual({
      type: "leaf",
      paneId: "pane-a",
      activeTabId: null,
      tabs: []
    });
  });

  it("keeps a pane open when closing one of multiple tabs", () => {
    const workspace = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-a",
      firstTabs: [terminalTab("tab-a", "session-a"), terminalTab("tab-b", "session-b")],
      firstActiveTabId: "tab-b",
      secondTabs: [terminalTab("tab-c", "session-c")],
      secondActiveTabId: "tab-c"
    });

    const next = closeProjectTab(workspace, "pane-a", "tab-b");
    const project = next.projects[0];

    expect(project.activePaneId).toBe("pane-a");
    expect(project.layout.type).toBe("split");
    if (project.layout.type === "split" && project.layout.first.type === "leaf") {
      expect(project.layout.first).toEqual({
        type: "leaf",
        paneId: "pane-a",
        activeTabId: "tab-a",
        tabs: [terminalTab("tab-a", "session-a")]
      });
    }
  });

  it("reorders tabs inside the same pane and keeps the moved tab active", () => {
    const tabA = terminalTab("tab-a", "session-a");
    const tabB = terminalTab("tab-b", "session-b");
    const tabC = terminalTab("tab-c", "session-c");
    const workspace = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-a",
      firstTabs: [tabA, tabB, tabC],
      firstActiveTabId: "tab-b",
      secondTabs: [],
      secondActiveTabId: null
    });

    const next = moveProjectTab(workspace, "pane-a", "tab-a", "pane-a", 3);
    const project = next.projects[0];

    expect(project.activePaneId).toBe("pane-a");
    expect(project.layout.type).toBe("split");
    if (project.layout.type === "split" && project.layout.first.type === "leaf") {
      expect(project.layout.first.tabs.map((tab) => tab.tabId)).toEqual([
        "tab-b",
        "tab-c",
        "tab-a"
      ]);
      expect(project.layout.first.activeTabId).toBe("tab-a");
    }
  });

  it("moves a tab across panes at the requested index and activates the target pane", () => {
    const tabA = terminalTab("tab-a", "session-a");
    const tabB = terminalTab("tab-b", "session-b");
    const tabC = terminalTab("tab-c", "session-c");
    const workspace = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-a",
      firstTabs: [tabA, tabB],
      firstActiveTabId: "tab-b",
      secondTabs: [tabC],
      secondActiveTabId: "tab-c"
    });

    const next = moveProjectTab(workspace, "pane-a", "tab-a", "pane-b", 0);
    const project = next.projects[0];

    expect(project.activePaneId).toBe("pane-b");
    expect(project.layout.type).toBe("split");
    if (
      project.layout.type === "split" &&
      project.layout.first.type === "leaf" &&
      project.layout.second.type === "leaf"
    ) {
      expect(project.layout.first.tabs.map((tab) => tab.tabId)).toEqual(["tab-b"]);
      expect(project.layout.first.activeTabId).toBe("tab-b");
      expect(project.layout.second.tabs.map((tab) => tab.tabId)).toEqual(["tab-a", "tab-c"]);
      expect(project.layout.second.activeTabId).toBe("tab-a");
    }
  });

  it("collapses the source pane when moving its last tab into another pane", () => {
    const tabA = terminalTab("tab-a", "session-a");
    const tabB = terminalTab("tab-b", "session-b");
    const workspace = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-a",
      firstTabs: [tabA],
      firstActiveTabId: "tab-a",
      secondTabs: [tabB],
      secondActiveTabId: "tab-b"
    });

    const next = moveProjectTab(workspace, "pane-a", "tab-a", "pane-b", 1);

    expect(next.projects[0].activePaneId).toBe("pane-b");
    expect(next.projects[0].layout).toEqual({
      type: "leaf",
      paneId: "pane-b",
      activeTabId: "tab-a",
      tabs: [tabB, tabA]
    });
  });

  it("returns the original workspace for invalid tab moves", () => {
    const workspace = createWorkspaceWithSplit({
      activeProjectId: "project-a",
      activePaneId: "pane-a",
      firstTabs: [terminalTab("tab-a", "session-a")],
      firstActiveTabId: "tab-a",
      secondTabs: [],
      secondActiveTabId: null
    });

    expect(moveProjectTab(workspace, "pane-a", "missing-tab", "pane-b", 0)).toBe(workspace);
    expect(moveProjectTab(workspace, "missing-pane", "tab-a", "pane-b", 0)).toBe(workspace);
    expect(moveProjectTab(workspace, "pane-a", "tab-a", "missing-pane", 0)).toBe(workspace);
    expect(moveProjectTab(workspace, "pane-a", "tab-a", "pane-a", 0)).toBe(workspace);
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

function terminalTab(tabId: string, sessionId: string): ProjectTab {
  return {
    kind: "terminal",
    pageId: null,
    sessionId,
    tabId,
    title: sessionId
  };
}
