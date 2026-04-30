import type {
  HtmlPageId,
  PaneSplitDirection,
  ProjectPane,
  ProjectPaneNode,
  ProjectTab,
  ProjectSummary,
  ProjectWorkspace,
  SessionSummary
} from "@aria/types";

export const MIN_SPLIT_RATIO = 0.15;
export const MAX_SPLIT_RATIO = 0.85;

export function createEmptyProjectWorkspace(): ProjectWorkspace {
  const paneId = createId();
  const project: ProjectSummary = {
    projectId: createId(),
    name: "Default Project",
    activePaneId: paneId,
    layout: {
      type: "leaf",
      paneId,
      activeTabId: null,
      tabs: []
    }
  };

  return {
    activeProjectId: project.projectId,
    projects: [project]
  };
}

export function selectProject(
  workspace: ProjectWorkspace,
  projectId: string
): ProjectWorkspace {
  if (!workspace.projects.some((project) => project.projectId === projectId)) {
    return workspace;
  }

  return {
    ...workspace,
    activeProjectId: projectId
  };
}

export function getActiveProject(workspace: ProjectWorkspace): ProjectSummary | null {
  return (
    workspace.projects.find((project) => project.projectId === workspace.activeProjectId) ??
    workspace.projects[0] ??
    null
  );
}

export function addSessionTabToActivePane(
  workspace: ProjectWorkspace,
  session: Pick<SessionSummary, "sessionId" | "title"> | { sessionId: string; title: string }
): ProjectWorkspace {
  const project = getActiveProject(workspace);
  if (!project) {
    return workspace;
  }

  const existing = findTab(project.layout, session.sessionId);
  if (existing) {
    return selectProjectTab(workspace, existing.paneId, existing.tabId);
  }

  const tab = {
    kind: "terminal",
    pageId: null,
    tabId: createId(),
    title: session.title,
    sessionId: session.sessionId
  } satisfies ProjectTab;
  const activePaneId = project.activePaneId;
  const layout = updateLeaf(project.layout, activePaneId, (pane) => ({
    ...pane,
    activeTabId: tab.tabId,
    tabs: [...pane.tabs, tab]
  }));

  return updateProject(workspace, project.projectId, {
    ...project,
    layout,
    activePaneId
  });
}

export function openHtmlTabInActiveProject(
  workspace: ProjectWorkspace,
  pageId: HtmlPageId,
  title: string
): ProjectWorkspace {
  const project = getActiveProject(workspace);
  if (!project) {
    return workspace;
  }

  const activePaneMatch = findHtmlTabInPane(project.layout, project.activePaneId, pageId);
  const existing = activePaneMatch ?? findHtmlTab(project.layout, pageId);
  if (existing) {
    return selectProjectTab(workspace, existing.paneId, existing.tabId);
  }

  if (!findActivePane(project.layout, project.activePaneId)) {
    return workspace;
  }

  const tab = {
    kind: "html",
    pageId,
    tabId: createId(),
    title,
    sessionId: null
  } satisfies ProjectTab;
  const layout = updateLeaf(project.layout, project.activePaneId, (pane) => ({
    ...pane,
    activeTabId: tab.tabId,
    tabs: [...pane.tabs, tab]
  }));

  return updateProject(workspace, project.projectId, {
    ...project,
    layout
  });
}

export function selectProjectTab(
  workspace: ProjectWorkspace,
  paneId: string,
  tabId: string
): ProjectWorkspace {
  const project = getActiveProject(workspace);
  if (!project) {
    return workspace;
  }

  return updateProject(workspace, project.projectId, {
    ...project,
    activePaneId: paneId,
    layout: updateLeaf(project.layout, paneId, (pane) =>
      pane.tabs.some((tab) => tab.tabId === tabId) ? { ...pane, activeTabId: tabId } : pane
    )
  });
}

export function closeProjectTab(
  workspace: ProjectWorkspace,
  paneId: string,
  tabId: string
): ProjectWorkspace {
  const project = getActiveProject(workspace);
  if (!project) {
    return workspace;
  }

  let changed = false;
  const layout = updateLeaf(project.layout, paneId, (pane) => {
    const closingIndex = pane.tabs.findIndex((tab) => tab.tabId === tabId);
    if (closingIndex === -1) {
      return pane;
    }

    changed = true;
    const tabs = pane.tabs.filter((tab) => tab.tabId !== tabId);
    const activeTabId =
      pane.activeTabId === tabId
        ? tabs[closingIndex - 1]?.tabId ?? tabs[closingIndex]?.tabId ?? null
        : pane.activeTabId;
    return { ...pane, tabs, activeTabId };
  });

  if (!changed) {
    return workspace;
  }

  return updateProject(workspace, project.projectId, {
    ...project,
    layout
  });
}

export function splitActivePane(
  workspace: ProjectWorkspace,
  direction: PaneSplitDirection
): ProjectWorkspace {
  const project = getActiveProject(workspace);
  if (!project) {
    return workspace;
  }

  const activePane = findActivePane(project.layout, project.activePaneId);
  if (!activePane) {
    return workspace;
  }

  const nextPane: ProjectPane = {
    type: "leaf",
    paneId: createId(),
    activeTabId: null,
    tabs: []
  };
  const split: ProjectPaneNode = {
    type: "split",
    splitId: createId(),
    direction,
    ratio: 0.5,
    first: activePane,
    second: nextPane
  };

  return updateProject(workspace, project.projectId, {
    ...project,
    activePaneId: nextPane.paneId,
    layout: replacePane(project.layout, activePane.paneId, split)
  });
}

export function updateProjectLayout(
  workspace: ProjectWorkspace,
  projectId: string,
  layout: ProjectPaneNode
): ProjectWorkspace {
  const project = workspace.projects.find((candidate) => candidate.projectId === projectId);
  if (!project) {
    return workspace;
  }

  return updateProject(workspace, projectId, {
    ...project,
    layout: normalizePaneNode(layout),
    activePaneId: findFirstPaneId(layout)
  });
}

export function clampSplitRatio(ratio: number): number {
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

export function normalizePaneNode(node: ProjectPaneNode): ProjectPaneNode {
  if (node.type === "leaf") {
    const activeTabId = node.tabs.some((tab) => tab.tabId === node.activeTabId)
      ? node.activeTabId
      : node.tabs[0]?.tabId ?? null;
    return { ...node, activeTabId };
  }

  return {
    ...node,
    ratio: clampSplitRatio(node.ratio),
    first: normalizePaneNode(node.first),
    second: normalizePaneNode(node.second)
  };
}

export function findActivePane(layout: ProjectPaneNode, paneId: string): ProjectPane | null {
  if (layout.type === "leaf") {
    return layout.paneId === paneId ? layout : null;
  }

  return findActivePane(layout.first, paneId) ?? findActivePane(layout.second, paneId);
}

function updateProject(
  workspace: ProjectWorkspace,
  projectId: string,
  nextProject: ProjectSummary
): ProjectWorkspace {
  return {
    ...workspace,
    projects: workspace.projects.map((project) =>
      project.projectId === projectId ? nextProject : project
    )
  };
}

function updateLeaf(
  node: ProjectPaneNode,
  paneId: string,
  update: (pane: ProjectPane) => ProjectPane
): ProjectPaneNode {
  if (node.type === "leaf") {
    return node.paneId === paneId ? update(node) : node;
  }

  return {
    ...node,
    first: updateLeaf(node.first, paneId, update),
    second: updateLeaf(node.second, paneId, update)
  };
}

function replacePane(
  node: ProjectPaneNode,
  paneId: string,
  replacement: ProjectPaneNode
): ProjectPaneNode {
  if (node.type === "leaf") {
    return node.paneId === paneId ? replacement : node;
  }

  return {
    ...node,
    first: replacePane(node.first, paneId, replacement),
    second: replacePane(node.second, paneId, replacement)
  };
}

function findTab(
  node: ProjectPaneNode,
  sessionId: string
): { paneId: string; tabId: string } | null {
  if (node.type === "leaf") {
    const tab = node.tabs.find(
      (candidate) => candidate.kind === "terminal" && candidate.sessionId === sessionId
    );
    return tab ? { paneId: node.paneId, tabId: tab.tabId } : null;
  }

  return findTab(node.first, sessionId) ?? findTab(node.second, sessionId);
}

function findHtmlTabInPane(
  node: ProjectPaneNode,
  paneId: string,
  pageId: HtmlPageId
): { paneId: string; tabId: string } | null {
  const pane = findActivePane(node, paneId);
  const tab = pane?.tabs.find(
    (candidate) => candidate.kind === "html" && candidate.pageId === pageId
  );
  return pane && tab ? { paneId: pane.paneId, tabId: tab.tabId } : null;
}

function findHtmlTab(
  node: ProjectPaneNode,
  pageId: HtmlPageId
): { paneId: string; tabId: string } | null {
  if (node.type === "leaf") {
    const tab = node.tabs.find(
      (candidate) => candidate.kind === "html" && candidate.pageId === pageId
    );
    return tab ? { paneId: node.paneId, tabId: tab.tabId } : null;
  }

  return findHtmlTab(node.first, pageId) ?? findHtmlTab(node.second, pageId);
}

function findFirstPaneId(node: ProjectPaneNode): string {
  return node.type === "leaf" ? node.paneId : findFirstPaneId(node.first);
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (Number(char) ^ (random & (15 >> (Number(char) / 4)))).toString(16);
  });
}
