import type {
  HtmlPageId,
  PaneSplitDirection,
  ProjectPane,
  ProjectPaneNode,
  ProjectTab,
  ProjectWindowGeometry,
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
    extraWindows: [],
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
  let closedPaneIsEmpty = false;
  const layout = updateLeaf(project.layout, paneId, (pane) => {
    const closingIndex = pane.tabs.findIndex((tab) => tab.tabId === tabId);
    if (closingIndex === -1) {
      return pane;
    }

    changed = true;
    const tabs = pane.tabs.filter((tab) => tab.tabId !== tabId);
    closedPaneIsEmpty = tabs.length === 0;
    const activeTabId =
      pane.activeTabId === tabId
        ? tabs[closingIndex - 1]?.tabId ?? tabs[closingIndex]?.tabId ?? null
        : pane.activeTabId;
    return { ...pane, tabs, activeTabId };
  });

  if (!changed) {
    return workspace;
  }

  const nextLayout =
    closedPaneIsEmpty && countPanes(project.layout) > 1
      ? removePane(layout, paneId) ?? layout
      : layout;
  const activePaneId = paneExists(nextLayout, project.activePaneId)
    ? project.activePaneId
    : findFirstPaneId(nextLayout);

  return updateProject(workspace, project.projectId, {
    ...project,
    activePaneId,
    layout: nextLayout
  });
}

export function moveProjectTab(
  workspace: ProjectWorkspace,
  sourcePaneId: string,
  tabId: string,
  targetPaneId: string,
  targetIndex: number
): ProjectWorkspace {
  const project = getActiveProject(workspace);
  if (!project) {
    return workspace;
  }

  const sourcePane = findActivePane(project.layout, sourcePaneId);
  const targetPane = findActivePane(project.layout, targetPaneId);
  if (!sourcePane || !targetPane) {
    return workspace;
  }

  const sourceIndex = sourcePane.tabs.findIndex((tab) => tab.tabId === tabId);
  if (sourceIndex === -1) {
    return workspace;
  }

  const movingTab = sourcePane.tabs[sourceIndex];
  if (sourcePaneId === targetPaneId) {
    const boundedTargetIndex = clampTabIndex(targetIndex, sourcePane.tabs.length);
    const insertionIndex =
      boundedTargetIndex > sourceIndex ? boundedTargetIndex - 1 : boundedTargetIndex;
    if (insertionIndex === sourceIndex) {
      return workspace;
    }

    const remainingTabs = sourcePane.tabs.filter((tab) => tab.tabId !== tabId);
    const tabs = insertTabAt(remainingTabs, movingTab, insertionIndex);
    const layout = updateLeaf(project.layout, sourcePaneId, (pane) => ({
      ...pane,
      activeTabId: tabId,
      tabs
    }));

    return updateProject(workspace, project.projectId, {
      ...project,
      activePaneId: sourcePaneId,
      layout
    });
  }

  const targetInsertionIndex = clampTabIndex(targetIndex, targetPane.tabs.length);
  let sourcePaneIsEmpty = false;
  const layoutWithMovedTab = updateLeaf(
    updateLeaf(project.layout, sourcePaneId, (pane) => {
      const nextTabs = pane.tabs.filter((tab) => tab.tabId !== tabId);
      sourcePaneIsEmpty = nextTabs.length === 0;
      return {
        ...pane,
        activeTabId:
          pane.activeTabId === tabId
            ? nextTabs[sourceIndex - 1]?.tabId ?? nextTabs[sourceIndex]?.tabId ?? null
            : pane.activeTabId,
        tabs: nextTabs
      };
    }),
    targetPaneId,
    (pane) => ({
      ...pane,
      activeTabId: tabId,
      tabs: insertTabAt(pane.tabs, movingTab, targetInsertionIndex)
    })
  );
  const layout =
    sourcePaneIsEmpty && countPanes(project.layout) > 1
      ? removePane(layoutWithMovedTab, sourcePaneId) ?? layoutWithMovedTab
      : layoutWithMovedTab;

  return updateProject(workspace, project.projectId, {
    ...project,
    activePaneId: targetPaneId,
    layout: normalizePaneNode(layout)
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

  return splitPane(workspace, project.activePaneId, direction);
}

export function splitPane(
  workspace: ProjectWorkspace,
  paneId: string,
  direction: PaneSplitDirection
): ProjectWorkspace {
  const project = getActiveProject(workspace);
  if (!project) {
    return workspace;
  }

  const pane = findActivePane(project.layout, paneId);
  if (!pane) {
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
    first: pane,
    second: nextPane
  };

  return updateProject(workspace, project.projectId, {
    ...project,
    activePaneId: nextPane.paneId,
    layout: replacePane(project.layout, pane.paneId, split)
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

type CreateProjectWindowFromTabOptions = {
  geometry: ProjectWindowGeometry;
  projectId: string;
  sourcePaneId: string;
  sourceWindowId: string | null;
  tabId: string;
  windowId: string;
};

export function createProjectWindowFromTab(
  workspace: ProjectWorkspace,
  options: CreateProjectWindowFromTabOptions
): ProjectWorkspace {
  const project = workspace.projects.find((candidate) => candidate.projectId === options.projectId);
  if (!project) {
    return workspace;
  }

  const source = getProjectWindowSlot(project, options.sourceWindowId);
  if (!source) {
    return workspace;
  }

  const extracted = extractTabFromLayout(source.layout, options.sourcePaneId, options.tabId);
  if (!extracted.tab) {
    return workspace;
  }

  const sourceLayout =
    extracted.sourcePaneIsEmpty && countPanes(source.layout) > 1
      ? removePane(extracted.layout, options.sourcePaneId) ?? extracted.layout
      : extracted.layout;
  const normalizedSourceLayout = normalizePaneNode(sourceLayout);
  const nextSourceActivePaneId = paneExists(normalizedSourceLayout, source.activePaneId)
    ? source.activePaneId
    : findFirstPaneId(normalizedSourceLayout);
  const windowPaneId = createId();
  const nextWindow = {
    windowId: options.windowId,
    activePaneId: windowPaneId,
    geometry: options.geometry,
    layout: {
      type: "leaf",
      paneId: windowPaneId,
      activeTabId: extracted.tab.tabId,
      tabs: [extracted.tab]
    }
  } satisfies ProjectSummary["extraWindows"][number];

  return updateProject(workspace, project.projectId, {
    ...project,
    activePaneId:
      options.sourceWindowId === null ? nextSourceActivePaneId : project.activePaneId,
    layout: options.sourceWindowId === null ? normalizedSourceLayout : project.layout,
    extraWindows: [
      ...project.extraWindows.map((window) =>
        window.windowId === options.sourceWindowId
          ? {
              ...window,
              activePaneId: nextSourceActivePaneId,
              layout: normalizedSourceLayout
            }
          : window
      ),
      nextWindow
    ]
  });
}

export function updateProjectWindowLayout(
  workspace: ProjectWorkspace,
  projectId: string,
  windowId: string | null,
  update: { activePaneId: string; layout: ProjectPaneNode }
): ProjectWorkspace {
  const project = workspace.projects.find((candidate) => candidate.projectId === projectId);
  if (!project) {
    return workspace;
  }

  const layout = normalizePaneNode(update.layout);
  const activePaneId = paneExists(layout, update.activePaneId)
    ? update.activePaneId
    : findFirstPaneId(layout);

  if (windowId === null) {
    return updateProject(workspace, projectId, {
      ...project,
      activePaneId,
      layout
    });
  }

  if (!project.extraWindows.some((window) => window.windowId === windowId)) {
    return workspace;
  }

  return updateProject(workspace, projectId, {
    ...project,
    extraWindows: project.extraWindows.map((window) =>
      window.windowId === windowId
        ? {
            ...window,
            activePaneId,
            layout
          }
        : window
    )
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

function getProjectWindowSlot(
  project: ProjectSummary,
  windowId: string | null
): { activePaneId: string; layout: ProjectPaneNode } | null {
  if (windowId === null) {
    return {
      activePaneId: project.activePaneId,
      layout: project.layout
    };
  }

  return project.extraWindows.find((window) => window.windowId === windowId) ?? null;
}

function extractTabFromLayout(
  node: ProjectPaneNode,
  paneId: string,
  tabId: string
): { layout: ProjectPaneNode; sourcePaneIsEmpty: boolean; tab: ProjectTab | null } {
  if (node.type === "leaf") {
    if (node.paneId !== paneId) {
      return { layout: node, sourcePaneIsEmpty: false, tab: null };
    }

    const tabIndex = node.tabs.findIndex((tab) => tab.tabId === tabId);
    if (tabIndex === -1) {
      return { layout: node, sourcePaneIsEmpty: false, tab: null };
    }

    const tab = node.tabs[tabIndex];
    const tabs = node.tabs.filter((candidate) => candidate.tabId !== tabId);
    return {
      layout: {
        ...node,
        activeTabId:
          node.activeTabId === tabId
            ? tabs[tabIndex - 1]?.tabId ?? tabs[tabIndex]?.tabId ?? null
            : node.activeTabId,
        tabs
      },
      sourcePaneIsEmpty: tabs.length === 0,
      tab
    };
  }

  const first = extractTabFromLayout(node.first, paneId, tabId);
  if (first.tab) {
    return {
      layout: { ...node, first: first.layout },
      sourcePaneIsEmpty: first.sourcePaneIsEmpty,
      tab: first.tab
    };
  }

  const second = extractTabFromLayout(node.second, paneId, tabId);
  return {
    layout: { ...node, second: second.layout },
    sourcePaneIsEmpty: second.sourcePaneIsEmpty,
    tab: second.tab
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

function removePane(node: ProjectPaneNode, paneId: string): ProjectPaneNode | null {
  if (node.type === "leaf") {
    return node.paneId === paneId ? null : node;
  }

  const first = removePane(node.first, paneId);
  const second = removePane(node.second, paneId);
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }

  return {
    ...node,
    first,
    second
  };
}

function clampTabIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) {
    return length;
  }

  return Math.min(length, Math.max(0, Math.trunc(index)));
}

function insertTabAt(
  tabs: readonly ProjectTab[],
  tab: ProjectTab,
  index: number
): readonly ProjectTab[] {
  return [...tabs.slice(0, index), tab, ...tabs.slice(index)];
}

function countPanes(node: ProjectPaneNode): number {
  return node.type === "leaf" ? 1 : countPanes(node.first) + countPanes(node.second);
}

function paneExists(node: ProjectPaneNode, paneId: string): boolean {
  if (node.type === "leaf") {
    return node.paneId === paneId;
  }

  return paneExists(node.first, paneId) || paneExists(node.second, paneId);
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
