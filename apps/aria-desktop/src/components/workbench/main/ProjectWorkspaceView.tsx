import type {
  AppSettings,
  PaneSplitDirection,
  ProjectPane,
  ProjectPaneNode,
  SessionMetadataDelta,
  SessionStreamMetadata,
  SessionSummary,
  SettingsGroup
} from "@aria/types";
import { Columns2, Rows2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";
import { SessionTabs } from "./SessionTabs";
import { HtmlTabHost } from "./HtmlTabHost";
import { TerminalTabSurface } from "./TerminalTabSurface";
import { clampSplitRatio, normalizePaneNode } from "./projectLayoutState";

const PROJECT_WORKSPACE_MESSAGES = defineMessages({
  unavailable: {
    key: "workbench.projects.session_unavailable",
    defaultMessage: "Session unavailable"
  },
  splitHorizontal: {
    key: "workbench.projects.split_horizontal",
    defaultMessage: "Split horizontally"
  },
  splitVertical: {
    key: "workbench.projects.split_vertical",
    defaultMessage: "Split vertically"
  },
  emptyPane: {
    key: "workbench.projects.empty_pane",
    defaultMessage: "No tabs in this pane"
  }
});

type ProjectWorkspaceViewProps = {
  activePaneId: string;
  layout: ProjectPaneNode;
  sessions: SessionSummary[];
  settings: AppSettings;
  selectedSettingsGroup: SettingsGroup;
  onActivatePane: (paneId: string) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onLayoutChange: (layout: ProjectPaneNode, activePaneId: string) => void;
  onResetSettingsGroup: (group: SettingsGroup) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onSelectSettingsGroup: (group: SettingsGroup) => void;
  onSplitPane: (direction: PaneSplitDirection) => void;
  onStreamDetached: (sessionId: string) => void;
  onStreamError: (error: unknown) => void;
  onStreamMetadata: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta: (sessionId: string, delta: SessionMetadataDelta) => void;
  onUpdateSettings: (next: Partial<AppSettings>) => void;
};

export function ProjectWorkspaceView({
  activePaneId,
  layout,
  sessions,
  settings,
  selectedSettingsGroup,
  onActivatePane,
  onCloseTab,
  onLayoutChange,
  onResetSettingsGroup,
  onSelectTab,
  onSelectSettingsGroup,
  onSplitPane,
  onStreamDetached,
  onStreamError,
  onStreamMetadata,
  onStreamMetadataDelta,
  onUpdateSettings
}: ProjectWorkspaceViewProps) {
  return (
    <section className="terminal-region terminal-workspace project-workspace">
      <PaneNodeView
        activePaneId={activePaneId}
        layout={layout}
        rootLayout={layout}
        selectedSettingsGroup={selectedSettingsGroup}
        sessions={sessions}
        settings={settings}
        onActivatePane={onActivatePane}
        onCloseTab={onCloseTab}
        onLayoutChange={onLayoutChange}
        onResetSettingsGroup={onResetSettingsGroup}
        onSelectTab={onSelectTab}
        onSelectSettingsGroup={onSelectSettingsGroup}
        onSplitPane={onSplitPane}
        onStreamDetached={onStreamDetached}
        onStreamError={onStreamError}
        onStreamMetadata={onStreamMetadata}
        onStreamMetadataDelta={onStreamMetadataDelta}
        onUpdateSettings={onUpdateSettings}
      />
    </section>
  );
}

type PaneNodeViewProps = ProjectWorkspaceViewProps & {
  rootLayout: ProjectPaneNode;
};

function PaneNodeView({
  activePaneId,
  layout,
  rootLayout,
  selectedSettingsGroup,
  sessions,
  settings,
  onActivatePane,
  onCloseTab,
  onLayoutChange,
  onResetSettingsGroup,
  onSelectTab,
  onSelectSettingsGroup,
  onSplitPane,
  onStreamDetached,
  onStreamError,
  onStreamMetadata,
  onStreamMetadataDelta,
  onUpdateSettings
}: PaneNodeViewProps) {
  if (layout.type === "leaf") {
    return (
      <ProjectPaneView
        pane={layout}
        isActivePane={layout.paneId === activePaneId}
        selectedSettingsGroup={selectedSettingsGroup}
        sessions={sessions}
        settings={settings}
        onActivatePane={onActivatePane}
        onCloseTab={onCloseTab}
        onResetSettingsGroup={onResetSettingsGroup}
        onSelectTab={onSelectTab}
        onSelectSettingsGroup={onSelectSettingsGroup}
        onSplitPane={onSplitPane}
        onStreamDetached={onStreamDetached}
        onStreamError={onStreamError}
        onStreamMetadata={onStreamMetadata}
        onStreamMetadataDelta={onStreamMetadataDelta}
        onUpdateSettings={onUpdateSettings}
      />
    );
  }

  const split = layout;
  const firstSize = `${split.ratio * 100}%`;
  const secondSize = `${(1 - split.ratio) * 100}%`;

  function updateRatioFromPointer(event: PointerEvent, parent: HTMLElement) {
    const rect = parent.getBoundingClientRect();
    const rawRatio =
      split.direction === "horizontal"
        ? (event.clientX - rect.left) / rect.width
        : (event.clientY - rect.top) / rect.height;
    onLayoutChange(
      replaceSplitRatio(rootLayout, split.splitId, clampSplitRatio(rawRatio)),
      activePaneId
    );
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const parent = event.currentTarget.parentElement;
    if (!parent) {
      return;
    }
    const handleMove = (moveEvent: PointerEvent) => updateRatioFromPointer(moveEvent, parent);
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  return (
    <div
      className={`project-split project-split-${split.direction}`}
      style={{
        gridTemplateColumns:
          split.direction === "horizontal" ? `${firstSize} 5px ${secondSize}` : undefined,
        gridTemplateRows:
          split.direction === "vertical" ? `${firstSize} 5px ${secondSize}` : undefined
      }}
    >
      <PaneNodeView
        activePaneId={activePaneId}
        layout={split.first}
        rootLayout={rootLayout}
        selectedSettingsGroup={selectedSettingsGroup}
        sessions={sessions}
        settings={settings}
        onActivatePane={onActivatePane}
        onCloseTab={onCloseTab}
        onLayoutChange={onLayoutChange}
        onResetSettingsGroup={onResetSettingsGroup}
        onSelectTab={onSelectTab}
        onSelectSettingsGroup={onSelectSettingsGroup}
        onSplitPane={onSplitPane}
        onStreamDetached={onStreamDetached}
        onStreamError={onStreamError}
        onStreamMetadata={onStreamMetadata}
        onStreamMetadataDelta={onStreamMetadataDelta}
        onUpdateSettings={onUpdateSettings}
      />
      <div
        className="project-split-divider"
        data-direction={split.direction}
        onPointerDown={handlePointerDown}
        role="separator"
      />
      <PaneNodeView
        activePaneId={activePaneId}
        layout={split.second}
        rootLayout={rootLayout}
        selectedSettingsGroup={selectedSettingsGroup}
        sessions={sessions}
        settings={settings}
        onActivatePane={onActivatePane}
        onCloseTab={onCloseTab}
        onLayoutChange={onLayoutChange}
        onResetSettingsGroup={onResetSettingsGroup}
        onSelectTab={onSelectTab}
        onSelectSettingsGroup={onSelectSettingsGroup}
        onSplitPane={onSplitPane}
        onStreamDetached={onStreamDetached}
        onStreamError={onStreamError}
        onStreamMetadata={onStreamMetadata}
        onStreamMetadataDelta={onStreamMetadataDelta}
        onUpdateSettings={onUpdateSettings}
      />
    </div>
  );
}

type ProjectPaneViewProps = {
  isActivePane: boolean;
  pane: ProjectPane;
  selectedSettingsGroup: SettingsGroup;
  sessions: SessionSummary[];
  settings: AppSettings;
  onActivatePane: (paneId: string) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onResetSettingsGroup: (group: SettingsGroup) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onSelectSettingsGroup: (group: SettingsGroup) => void;
  onSplitPane: (direction: PaneSplitDirection) => void;
  onStreamDetached: (sessionId: string) => void;
  onStreamError: (error: unknown) => void;
  onStreamMetadata: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta: (sessionId: string, delta: SessionMetadataDelta) => void;
  onUpdateSettings: (next: Partial<AppSettings>) => void;
};

function ProjectPaneView({
  isActivePane,
  pane,
  selectedSettingsGroup,
  sessions,
  settings,
  onActivatePane,
  onCloseTab,
  onResetSettingsGroup,
  onSelectTab,
  onSelectSettingsGroup,
  onSplitPane,
  onStreamDetached,
  onStreamError,
  onStreamMetadata,
  onStreamMetadataDelta,
  onUpdateSettings
}: ProjectPaneViewProps) {
  const t = useT();
  const activeTab = pane.tabs.find((tab) => tab.tabId === pane.activeTabId) ?? pane.tabs[0] ?? null;
  const activeSession = activeTab?.kind === "terminal" && activeTab.sessionId
    ? sessions.find((session) => session.sessionId === activeTab.sessionId)
    : null;

  return (
    <section
      className={`project-pane ${isActivePane ? "project-pane-active" : ""}`}
      onFocus={() => onActivatePane(pane.paneId)}
      onPointerDown={() => onActivatePane(pane.paneId)}
    >
      <div className="project-pane-tabs">
        <SessionTabs
          onCloseTab={(tabId) => onCloseTab(pane.paneId, tabId)}
          onSelectTab={(tabId) => onSelectTab(pane.paneId, tabId)}
          selectedTabId={activeTab?.tabId ?? null}
          tabs={pane.tabs.map((tab) => ({
            tabId: tab.tabId,
            title:
              sessions.find((session) => session.sessionId === tab.sessionId)?.title ??
              tab.title ??
              t(PROJECT_WORKSPACE_MESSAGES.unavailable)
          }))}
        />
        <div className="project-pane-actions">
          <button
            aria-label={t(PROJECT_WORKSPACE_MESSAGES.splitHorizontal)}
            className="sidebar-icon-button"
            onClick={() => onSplitPane("horizontal")}
            type="button"
          >
            <Columns2 aria-hidden="true" size={14} strokeWidth={2} />
          </button>
          <button
            aria-label={t(PROJECT_WORKSPACE_MESSAGES.splitVertical)}
            className="sidebar-icon-button"
            onClick={() => onSplitPane("vertical")}
            type="button"
          >
            <Rows2 aria-hidden="true" size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="project-pane-content">
        {pane.tabs.length === 0 ? (
          <div className="terminal-empty-state">{t(PROJECT_WORKSPACE_MESSAGES.emptyPane)}</div>
        ) : null}
        {activeTab?.kind === "terminal" && !activeSession ? (
          <div className="terminal-empty-state">{t(PROJECT_WORKSPACE_MESSAGES.unavailable)}</div>
        ) : null}
        {pane.tabs.map((tab) =>
          tab.kind === "terminal" && tab.sessionId ? (
            <TerminalTabSurface
              key={tab.tabId}
              isActive={
                tab.tabId === activeTab?.tabId &&
                Boolean(sessions.find((session) => session.sessionId === tab.sessionId))
              }
              onStreamDetached={onStreamDetached}
              onStreamError={onStreamError}
              onStreamMetadata={onStreamMetadata}
              onStreamMetadataDelta={onStreamMetadataDelta}
              sessionId={tab.sessionId}
              settings={settings}
            />
          ) : tab.kind === "html" && tab.pageId && tab.tabId === activeTab?.tabId ? (
            <HtmlTabHost
              key={tab.tabId}
              onResetSettingsGroup={onResetSettingsGroup}
              onSelectSettingsGroup={onSelectSettingsGroup}
              onUpdateSettings={onUpdateSettings}
              pageId={tab.pageId}
              selectedSettingsGroup={selectedSettingsGroup}
              settings={settings}
            />
          ) : null
        )}
      </div>
    </section>
  );
}

function replaceSplitRatio(
  node: ProjectPaneNode,
  splitId: string,
  ratio: number
): ProjectPaneNode {
  if (node.type === "leaf") {
    return node;
  }

  if (node.splitId === splitId) {
    return normalizePaneNode({ ...node, ratio });
  }

  return {
    ...node,
    first: replaceSplitRatio(node.first, splitId, ratio),
    second: replaceSplitRatio(node.second, splitId, ratio)
  };
}
