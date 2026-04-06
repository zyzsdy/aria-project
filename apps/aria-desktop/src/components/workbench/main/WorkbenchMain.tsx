import type {
  AppSettings,
  SessionMetadataDelta,
  SessionStreamMetadata,
  SessionSummary,
  SettingsGroup
} from "@aria/types";
import { useT } from "../../../i18n/react";
import { HtmlTabHost } from "./HtmlTabHost";
import { getHtmlPageTitle } from "./htmlPageTitles";
import { SessionTabs } from "./SessionTabs";
import { TerminalWorkspace } from "./TerminalWorkspace";
import type { TerminalTab, WorkbenchTab } from "./tabState";

type WorkbenchMainProps = {
  tabs: WorkbenchTab[];
  activeTab: WorkbenchTab | null;
  sessions: SessionSummary[];
  settings: AppSettings;
  selectedSettingsGroup: SettingsGroup;
  onStreamDetached: (sessionId: string) => void;
  onStreamError: (error: unknown) => void;
  onStreamMetadata: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta: (sessionId: string, delta: SessionMetadataDelta) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onSelectSettingsGroup: (group: SettingsGroup) => void;
  onUpdateSettings: (next: Partial<AppSettings>) => void;
  onResetSettingsGroup: (group: SettingsGroup) => void;
};

export function WorkbenchMain({
  tabs,
  activeTab,
  sessions,
  settings,
  selectedSettingsGroup,
  onStreamDetached,
  onStreamError,
  onStreamMetadata,
  onStreamMetadataDelta,
  onSelectTab,
  onCloseTab,
  onSelectSettingsGroup,
  onUpdateSettings,
  onResetSettingsGroup
}: WorkbenchMainProps) {
  const t = useT();
  const terminalTabs = tabs.filter((tab): tab is TerminalTab => tab.type === "terminal");
  const htmlTab = activeTab?.type === "html" ? activeTab : null;
  const showTerminalWorkspace = terminalTabs.length > 0 || !htmlTab;

  return (
    <section className="main-shell">
      <SessionTabs
        onCloseTab={onCloseTab}
        onSelectTab={onSelectTab}
        selectedTabId={activeTab?.id ?? null}
        tabs={tabs.map((tab) => ({
          tabId: tab.id,
          title:
            tab.type === "terminal"
              ? sessions.find((session) => session.sessionId === tab.sessionId)?.title ??
                tab.sessionId
              : getHtmlPageTitle(tab.pageId, t)
        }))}
      />

      <section className="main-content-shell">
        {showTerminalWorkspace ? (
          <TerminalWorkspace
            activeTabId={activeTab?.type === "terminal" ? activeTab.id : null}
            onStreamDetached={onStreamDetached}
            onStreamError={onStreamError}
            onStreamMetadata={onStreamMetadata}
            onStreamMetadataDelta={onStreamMetadataDelta}
            settings={settings}
            tabs={terminalTabs}
            visibility={htmlTab ? "hidden" : "visible"}
          />
        ) : null}

        {htmlTab ? (
          <div className="html-tab-layer">
            <HtmlTabHost
              onResetSettingsGroup={onResetSettingsGroup}
              onSelectSettingsGroup={onSelectSettingsGroup}
              onUpdateSettings={onUpdateSettings}
              pageId={htmlTab.pageId}
              selectedSettingsGroup={selectedSettingsGroup}
              settings={settings}
            />
          </div>
        ) : null}
      </section>
    </section>
  );
}
