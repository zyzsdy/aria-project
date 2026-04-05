import type {
  AppSettings,
  SessionMetadataDelta,
  SessionStreamMetadata
} from "@aria/types";
import { TerminalTabSurface } from "./TerminalTabSurface";
import type { TerminalTab } from "./tabState";

type TerminalWorkspaceProps = {
  activeTabId: string | null;
  settings: AppSettings;
  tabs: TerminalTab[];
  visibility: "visible" | "hidden";
  onStreamDetached: (sessionId: string) => void;
  onStreamError: (error: unknown) => void;
  onStreamMetadata: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta: (sessionId: string, delta: SessionMetadataDelta) => void;
};

export function TerminalWorkspace({
  activeTabId,
  settings,
  tabs,
  visibility,
  onStreamDetached,
  onStreamError,
  onStreamMetadata,
  onStreamMetadataDelta
}: TerminalWorkspaceProps) {
  const isHidden = visibility === "hidden";

  return (
    <section
      aria-hidden={isHidden}
      className="terminal-region terminal-workspace"
      data-terminal-workspace-visibility={visibility}
    >
      {tabs.length > 0 ? (
        tabs.map((tab) => (
          <TerminalTabSurface
            key={tab.id}
            isActive={!isHidden && tab.id === activeTabId}
            onStreamDetached={onStreamDetached}
            onStreamError={onStreamError}
            onStreamMetadata={onStreamMetadata}
            onStreamMetadataDelta={onStreamMetadataDelta}
            sessionId={tab.sessionId}
            settings={settings}
          />
        ))
      ) : (
        <div className="terminal-empty-state">
          {"\u5f53\u524d\u6ca1\u6709\u6807\u7b7e\u9875\u6253\u5f00"}
        </div>
      )}
    </section>
  );
}
