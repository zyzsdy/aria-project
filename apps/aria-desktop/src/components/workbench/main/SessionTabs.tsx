import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type WheelEvent
} from "react";
import { X } from "lucide-react";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";
import { getTabStripScrollDelta, shouldHandleTabStripWheel } from "./tabStripScroll";
import { getTabStripThumbMetrics } from "./tabStripScrollbar";

const SESSION_TAB_MESSAGES = defineMessages({
  ariaLabel: {
    key: "workbench.tabs.aria_label",
    defaultMessage: "Session tabs"
  },
  closeTab: {
    key: "workbench.tabs.close_tab",
    defaultMessage: "Close {title}"
  }
});

type SessionTab = {
  tabId: string;
  title: string;
};

type SessionTabsProps = {
  tabs: SessionTab[];
  selectedTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
};

export function SessionTabs({ tabs, selectedTabId, onSelectTab, onCloseTab }: SessionTabsProps) {
  const t = useT();
  const tabStripRef = useRef<HTMLElement | null>(null);
  const tabStripTrackRef = useRef<HTMLDivElement | null>(null);
  const [thumbMetrics, setThumbMetrics] = useState(() => ({
    offset: 0,
    size: 0,
    visible: false
  }));

  const syncThumbMetrics = useCallback(() => {
    const tabStrip = tabStripRef.current;
    if (!tabStrip) {
      return;
    }

    setThumbMetrics(
      getTabStripThumbMetrics({
        clientWidth: tabStrip.clientWidth,
        scrollLeft: tabStrip.scrollLeft,
        scrollWidth: tabStrip.scrollWidth
      })
    );
  }, []);

  useEffect(() => {
    syncThumbMetrics();

    const tabStrip = tabStripRef.current;
    const tabStripTrack = tabStripTrackRef.current;
    if (!tabStrip) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncThumbMetrics();
    });
    resizeObserver.observe(tabStrip);
    if (tabStripTrack) {
      resizeObserver.observe(tabStripTrack);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [syncThumbMetrics, tabs]);

  function handleWheel(event: WheelEvent<HTMLElement>) {
    const tabStrip = tabStripRef.current;
    if (!tabStrip) {
      return;
    }

    if (
      !shouldHandleTabStripWheel({
        clientWidth: tabStrip.clientWidth,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        scrollWidth: tabStrip.scrollWidth
      })
    ) {
      return;
    }

    event.preventDefault();
    tabStrip.scrollLeft += getTabStripScrollDelta({
      deltaX: event.deltaX,
      deltaY: event.deltaY
    });
    syncThumbMetrics();
  }

  return (
    <div className="tab-strip-shell">
      <nav
        ref={tabStripRef}
        aria-label={t(SESSION_TAB_MESSAGES.ariaLabel)}
        className="tab-strip"
        onScroll={syncThumbMetrics}
        onWheel={handleWheel}
      >
        <div ref={tabStripTrackRef} className="tab-strip-track">
          {tabs.map((tab) => (
            <div
              key={tab.tabId}
              className={`tab ${tab.tabId === selectedTabId ? "tab-active" : ""}`}
            >
              <button className="tab-button" onClick={() => onSelectTab(tab.tabId)} type="button">
                <span className="tab-title">{tab.title}</span>
              </button>
              <button
                aria-label={t(SESSION_TAB_MESSAGES.closeTab, { title: tab.title })}
                className="tab-close-button"
                onClick={() => onCloseTab(tab.tabId)}
                type="button"
              >
                <X aria-hidden="true" size={14} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      </nav>
      <div
        aria-hidden="true"
        className={`tab-strip-scrollbar ${thumbMetrics.visible ? "tab-strip-scrollbar-visible" : ""}`}
      >
        <div
          className="tab-strip-scrollbar-thumb"
          style={
            {
              transform: `translateX(${thumbMetrics.offset}px)`,
              width: `${thumbMetrics.size}px`
            } as CSSProperties
          }
        />
      </div>
    </div>
  );
}
