import type { HtmlPageId } from "@aria/types";
export type { HtmlPageId } from "@aria/types";

export type TerminalTab = {
  id: `terminal:${string}`;
  type: "terminal";
  sessionId: string;
};

export type HtmlTab = {
  id: `html:${HtmlPageId}`;
  type: "html";
  pageId: HtmlPageId;
  title: string;
};

export type WorkbenchTab = TerminalTab | HtmlTab;

export type WorkbenchTabState = {
  tabs: WorkbenchTab[];
  selectedTabId: string | null;
};

export function createTerminalTab(sessionId: string): TerminalTab {
  return {
    id: `terminal:${sessionId}`,
    type: "terminal",
    sessionId
  };
}

export function createHtmlTab(pageId: HtmlPageId, title: string): HtmlTab {
  return {
    id: `html:${pageId}`,
    type: "html",
    pageId,
    title
  };
}

export function openWorkbenchTab(
  tabs: WorkbenchTab[],
  selectedTabId: string | null,
  tab: WorkbenchTab
): WorkbenchTabState {
  return {
    tabs: tabs.some((current) => current.id === tab.id) ? tabs : [...tabs, tab],
    selectedTabId: tab.id
  };
}

export function closeWorkbenchTab(
  tabs: WorkbenchTab[],
  selectedTabId: string | null,
  tabId: string
): WorkbenchTabState {
  const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (closingIndex === -1) {
    return { tabs, selectedTabId };
  }

  const nextTabs = tabs.filter((tab) => tab.id !== tabId);
  if (selectedTabId !== tabId) {
    return { tabs: nextTabs, selectedTabId };
  }

  const nextSelectedTabId = tabs[closingIndex - 1]?.id ?? tabs[closingIndex + 1]?.id ?? null;
  return {
    tabs: nextTabs,
    selectedTabId: nextSelectedTabId
  };
}

export function reconcileOpenTabs(
  tabs: WorkbenchTab[],
  selectedTabId: string | null,
  availableSessionIds: string[]
): WorkbenchTabState {
  const availableSessionIdSet = new Set(availableSessionIds);
  const nextTabs = tabs.filter(
    (tab) => tab.type === "html" || availableSessionIdSet.has(tab.sessionId)
  );
  const selectedStillExists = selectedTabId
    ? nextTabs.some((tab) => tab.id === selectedTabId)
    : false;

  return {
    tabs: nextTabs,
    selectedTabId: selectedStillExists ? selectedTabId : nextTabs[0]?.id ?? null
  };
}
