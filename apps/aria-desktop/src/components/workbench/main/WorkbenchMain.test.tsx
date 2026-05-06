import { DEFAULT_APP_SETTINGS, type ProjectWorkspace } from "@aria/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./ProjectWorkspaceView", () => ({
  ProjectWorkspaceView: ({ activePaneId }: { activePaneId: string }) => (
    <section className="project-workspace" data-active-pane-id={activePaneId} />
  )
}));

import { WorkbenchMain } from "./WorkbenchMain";

describe("WorkbenchMain", () => {
  it("renders the active project workspace", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchMain
        busy={false}
        defaultProfileId="builtin:powershell"
        onActivatePane={() => undefined}
        onCloseProjectTab={() => undefined}
        onDetachProjectTab={() => undefined}
        onMoveProjectTab={() => undefined}
        onCreateSession={() => undefined}
        onCreateSessionWithProfile={() => undefined}
        onProjectLayoutChange={() => undefined}
        onRenameSession={() => undefined}
        onStreamDetached={() => undefined}
        onStreamError={() => undefined}
        onStreamMetadata={() => undefined}
        onStreamMetadataDelta={() => undefined}
        shouldCloseSessionIfUnusedOnDispose={() => false}
        onResetSettingsGroup={() => undefined}
        onSelectProjectTab={() => undefined}
        onSelectSettingsGroup={() => undefined}
        onSplitPane={() => undefined}
        onUpdateSettings={() => undefined}
        profiles={[]}
        projectWorkspace={createWorkspace()}
        selectedSettingsGroup="appearance"
        sessions={[]}
        settings={DEFAULT_APP_SETTINGS}
      />
    );

    expect(markup).toContain("project-workspace");
    expect(markup).toContain('data-active-pane-id="pane-a"');
    expect(markup).not.toContain("project-title-strip");
    expect(markup).not.toContain("html-tab-layer");
  });

  it("does not render a global html page overlay", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchMain
        busy={false}
        defaultProfileId="builtin:powershell"
        onActivatePane={() => undefined}
        onCloseProjectTab={() => undefined}
        onDetachProjectTab={() => undefined}
        onMoveProjectTab={() => undefined}
        onCreateSession={() => undefined}
        onCreateSessionWithProfile={() => undefined}
        onProjectLayoutChange={() => undefined}
        onRenameSession={() => undefined}
        onStreamDetached={() => undefined}
        onStreamError={() => undefined}
        onStreamMetadata={() => undefined}
        onStreamMetadataDelta={() => undefined}
        shouldCloseSessionIfUnusedOnDispose={() => false}
        onResetSettingsGroup={() => undefined}
        onSelectProjectTab={() => undefined}
        onSelectSettingsGroup={() => undefined}
        onSplitPane={() => undefined}
        onUpdateSettings={() => undefined}
        profiles={[]}
        projectWorkspace={createWorkspace()}
        selectedSettingsGroup="appearance"
        sessions={[]}
        settings={DEFAULT_APP_SETTINGS}
      />
    );

    expect(markup).toContain("project-workspace");
    expect(markup).not.toContain("html-tab-layer");
    expect(markup).not.toContain("html-tab-region");
  });
});

function createWorkspace(): ProjectWorkspace {
  return {
    activeProjectId: "project-a",
    projects: [
      {
        projectId: "project-a",
        name: "Default Project",
        activePaneId: "pane-a",
        extraWindows: [],
        layout: {
          type: "leaf",
          paneId: "pane-a",
          activeTabId: null,
          tabs: []
        }
      }
    ]
  };
}
