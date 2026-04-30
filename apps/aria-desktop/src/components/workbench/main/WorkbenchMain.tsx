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
  onActivatePane: (paneId: string) => void;
  onCloseProjectTab: (paneId: string, tabId: string) => void;
  onProjectLayoutChange: (layout: ProjectPaneNode, activePaneId: string) => void;
  onSelectProjectTab: (paneId: string, tabId: string) => void;
  onSplitPane: (direction: PaneSplitDirection) => void;
  onSelectSettingsGroup: (group: SettingsGroup) => void;
  onUpdateSettings: (next: Partial<AppSettings>) => void;
  onResetSettingsGroup: (group: SettingsGroup) => void;
};

export function WorkbenchMain({
  busy,
  defaultProfileId,
  projectWorkspace,
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
  onActivatePane,
  onCloseProjectTab,
  onProjectLayoutChange,
  onSelectProjectTab,
  onSplitPane,
  onSelectSettingsGroup,
  onUpdateSettings,
  onResetSettingsGroup
}: WorkbenchMainProps) {
  const activeProject = getActiveProject(projectWorkspace);

  return (
    <section className="main-shell">
      <section className="main-content-shell">
        {activeProject ? (
          <ProjectWorkspaceView
            activePaneId={activeProject.activePaneId}
            busy={busy}
            defaultProfileId={defaultProfileId}
            layout={activeProject.layout}
            onCreateSession={onCreateSession}
            onCreateSessionWithProfile={onCreateSessionWithProfile}
            onActivatePane={onActivatePane}
            onCloseTab={onCloseProjectTab}
            onLayoutChange={onProjectLayoutChange}
            onResetSettingsGroup={onResetSettingsGroup}
            onSelectTab={onSelectProjectTab}
            onSelectSettingsGroup={onSelectSettingsGroup}
            onSplitPane={onSplitPane}
            onStreamDetached={onStreamDetached}
            onStreamError={onStreamError}
            onStreamMetadata={onStreamMetadata}
            onStreamMetadataDelta={onStreamMetadataDelta}
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
