import type { AppSettings, SettingsGroup } from "@aria/types";
import type { SessionSummary } from "@aria/types";
import type { RefCallback } from "react";
import { HtmlTabHost } from "./HtmlTabHost";
import { SessionTabs } from "./SessionTabs";
import { TerminalPane } from "./TerminalPane";
import type { WorkbenchTab } from "./tabState";

type WorkbenchMainProps = {
  tabs: WorkbenchTab[];
  activeTab: WorkbenchTab | null;
  sessions: SessionSummary[];
  settings: AppSettings;
  selectedSettingsGroup: SettingsGroup;
  streamState: "detached" | "attaching" | "attached" | "reconnecting";
  terminalHostRef: RefCallback<HTMLDivElement>;
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
  streamState,
  terminalHostRef,
  onSelectTab,
  onCloseTab,
  onSelectSettingsGroup,
  onUpdateSettings,
  onResetSettingsGroup
}: WorkbenchMainProps) {
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
              : tab.title
        }))}
      />

      {activeTab?.type === "html" ? (
        <HtmlTabHost
          onResetSettingsGroup={onResetSettingsGroup}
          onSelectSettingsGroup={onSelectSettingsGroup}
          onUpdateSettings={onUpdateSettings}
          pageId={activeTab.pageId}
          selectedSettingsGroup={selectedSettingsGroup}
          settings={settings}
        />
      ) : (
        <TerminalPane
          selectedSessionId={activeTab?.type === "terminal" ? activeTab.sessionId : null}
          streamState={streamState}
          terminalHostRef={terminalHostRef}
        />
      )}
    </section>
  );
}
