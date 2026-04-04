import type { SessionSummary } from "@aria/types";
import type { RefCallback } from "react";
import { SessionTabs } from "./SessionTabs";
import { TerminalPane } from "./TerminalPane";

type WorkbenchMainProps = {
  sessions: SessionSummary[];
  openTabSessionIds: string[];
  selectedSessionId: string | null;
  streamState: "detached" | "attaching" | "attached" | "reconnecting";
  terminalHostRef: RefCallback<HTMLDivElement>;
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
};

export function WorkbenchMain({
  sessions,
  openTabSessionIds,
  selectedSessionId,
  streamState,
  terminalHostRef,
  onSelectTab,
  onCloseTab
}: WorkbenchMainProps) {
  const tabs = openTabSessionIds.flatMap((sessionId) => {
    const session = sessions.find((current) => current.sessionId === sessionId);
    return session ? [session] : [];
  });

  const activeSessionId = tabs.some((tab) => tab.sessionId === selectedSessionId)
    ? selectedSessionId
    : null;

  return (
    <section className="main-shell">
      <SessionTabs
        onCloseTab={onCloseTab}
        onSelectTab={onSelectTab}
        selectedSessionId={activeSessionId}
        tabs={tabs.map((tab) => ({
          sessionId: tab.sessionId,
          title: tab.title
        }))}
      />
      <TerminalPane
        selectedSessionId={activeSessionId}
        streamState={streamState}
        terminalHostRef={terminalHostRef}
      />
    </section>
  );
}
