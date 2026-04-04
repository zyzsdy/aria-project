import type { RefCallback } from "react";

type TerminalPaneProps = {
  selectedSessionId: string | null;
  streamState: "detached" | "attaching" | "attached" | "reconnecting";
  terminalHostRef: RefCallback<HTMLDivElement>;
};

export function TerminalPane({
  selectedSessionId,
  streamState,
  terminalHostRef
}: TerminalPaneProps) {
  return (
    <section className="terminal-region" data-stream-state={streamState}>
      {selectedSessionId ? (
        <div ref={terminalHostRef} className="terminal-surface" />
      ) : (
        <div className="terminal-empty-state">
          {"\u5f53\u524d\u6ca1\u6709\u6807\u7b7e\u9875\u6253\u5f00"}
        </div>
      )}
    </section>
  );
}
