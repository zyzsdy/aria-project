import type {
  AppSettings,
  PaneSplitDirection,
  ProjectPaneNode,
  ProjectWorkspace,
  SessionMetadataDelta,
  SessionStreamMetadata,
  SessionSummary,
  ShellProfile,
  SettingsGroup
} from "@aria/types";
import { ProjectWorkspaceView } from "./ProjectWorkspaceView";
import { getActiveProject } from "./projectLayoutState";

type WorkbenchMainProps = {
  busy: boolean;
  defaultProfileId: string;
  projectWorkspace: ProjectWorkspace;
  projectWindowId?: string | null;
  profiles: readonly ShellProfile[];
  sessions: SessionSummary[];
  settings: AppSettings;
  selectedSettingsGroup: SettingsGroup;
  onCreateSession: () => void;
  onCreateSessionWithProfile: (profileId: string) => void;
  onStreamDetached: (sessionId: string) => void;
  onStreamError: (error: unknown) => void;
  onStreamMetadata: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta: (sessionId: string, delta: SessionMetadataDelta) => void;
  shouldCloseSessionIfUnusedOnDispose: (tabId: string) => boolean;
  onActivatePane: (paneId: string) => void;
  onCloseProjectTab: (paneId: string, tabId: string) => void;
  onDetachProjectTab: (paneId: string, tabId: string, sessionId: string) => void;
  onMoveProjectTab: (
    sourcePaneId: string,
    tabId: string,
    targetPaneId: string,
    targetIndex: number
  ) => void;
  onMoveProjectTabToNewWindow?: (
    sourcePaneId: string,
    tabId: string,
    releasePoint: { x: number; y: number }
  ) => void;
  onProjectLayoutChange: (layout: ProjectPaneNode, activePaneId: string) => void;
  onRenameSession: (sessionId: string) => void;
  onSelectProjectTab: (paneId: string, tabId: string) => void;
  onSplitPane: (paneId: string, direction: PaneSplitDirection) => void;
  onSelectSettingsGroup: (group: SettingsGroup) => void;
  onUpdateSettings: (next: Partial<AppSettings>) => void;
  onResetSettingsGroup: (group: SettingsGroup) => void;
};

export function WorkbenchMain({
  busy,
  defaultProfileId,
  projectWorkspace,
  projectWindowId = null,
  profiles,
  sessions,
  settings,
  selectedSettingsGroup,
  onCreateSession,
  onCreateSessionWithProfile,
  onStreamDetached,
  onStreamError,
  onStreamMetadata,
  onStreamMetadataDelta,
  shouldCloseSessionIfUnusedOnDispose,
  onActivatePane,
  onCloseProjectTab,
  onDetachProjectTab,
  onMoveProjectTab,
  onMoveProjectTabToNewWindow = () => undefined,
  onProjectLayoutChange,
  onRenameSession,
  onSelectProjectTab,
  onSplitPane,
  onSelectSettingsGroup,
  onUpdateSettings,
  onResetSettingsGroup
}: WorkbenchMainProps) {
  const activeProject = getActiveProject(projectWorkspace);
  const activeWindow = activeProject
    ? projectWindowId === null
      ? {
          activePaneId: activeProject.activePaneId,
          layout: activeProject.layout
        }
      : activeProject.extraWindows.find((window) => window.windowId === projectWindowId) ?? null
    : null;

  return (
    <section className="main-shell">
      <section className="main-content-shell">
        {activeWindow ? (
          <ProjectWorkspaceView
            activePaneId={activeWindow.activePaneId}
            busy={busy}
            defaultProfileId={defaultProfileId}
            layout={activeWindow.layout}
            onCreateSession={onCreateSession}
            onCreateSessionWithProfile={onCreateSessionWithProfile}
            onActivatePane={onActivatePane}
            onCloseTab={onCloseProjectTab}
            onDetachTab={onDetachProjectTab}
            onLayoutChange={onProjectLayoutChange}
            onMoveTab={onMoveProjectTab}
            onMoveTabToNewWindow={onMoveProjectTabToNewWindow}
            onRenameSession={onRenameSession}
            onResetSettingsGroup={onResetSettingsGroup}
            onSelectTab={onSelectProjectTab}
            onSelectSettingsGroup={onSelectSettingsGroup}
            onSplitPane={onSplitPane}
            onStreamDetached={onStreamDetached}
            onStreamError={onStreamError}
            onStreamMetadata={onStreamMetadata}
            onStreamMetadataDelta={onStreamMetadataDelta}
            shouldCloseSessionIfUnusedOnDispose={shouldCloseSessionIfUnusedOnDispose}
            onUpdateSettings={onUpdateSettings}
            selectedSettingsGroup={selectedSettingsGroup}
            settings={settings}
            profiles={profiles}
            sessions={sessions}
          />
        ) : null}
      </section>
    </section>
  );
}
