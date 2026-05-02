import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appWindow]);

  return (
    <div className="title-bar" data-tauri-drag-region>
      <span className="title-bar-title" data-tauri-drag-region>
        Aria Terminal
      </span>
      <div className="title-bar-controls">
        <button
          className="title-bar-btn"
          onClick={() => appWindow.minimize()}
          type="button"
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>
        <button
          className="title-bar-btn"
          onClick={() => appWindow.toggleMaximize()}
          type="button"
        >
          {isMaximized ? (
            <Copy size={12} strokeWidth={1.5} />
          ) : (
            <Square size={12} strokeWidth={1.5} />
          )}
        </button>
        <button
          className="title-bar-btn title-bar-btn-close"
          onClick={() => appWindow.close()}
          type="button"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
