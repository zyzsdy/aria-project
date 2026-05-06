import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent
} from "react";
import type { ProjectTabKind, SessionStatus, ShellProfile } from "@aria/types";
import { ChevronDown, Plus, X } from "lucide-react";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";
import { getTabStripScrollDelta, shouldHandleTabStripWheel } from "./tabStripScroll";
import { getTabStripThumbMetrics } from "./tabStripScrollbar";

const POINTER_DRAG_THRESHOLD_PX = 4;

const SESSION_TAB_MESSAGES = defineMessages({
  ariaLabel: {
    key: "workbench.tabs.aria_label",
    defaultMessage: "Session tabs"
  },
  closeTab: {
    key: "workbench.tabs.close_tab",
    defaultMessage: "Close {title}"
  },
  createSession: {
    key: "workbench.sidebar.create_session",
    defaultMessage: "Create session"
  },
  openShellProfiles: {
    key: "workbench.sidebar.open_shell_profiles",
    defaultMessage: "Open shell profiles"
  },
  defaultProfile: {
    key: "workbench.sidebar.default_profile_badge",
    defaultMessage: "Default"
  },
  rename: {
    key: "workbench.tabs.rename",
    defaultMessage: "Rename"
  },
  splitVertical: {
    key: "workbench.tabs.split_vertical",
    defaultMessage: "Split vertically"
  },
  splitHorizontal: {
    key: "workbench.tabs.split_horizontal",
    defaultMessage: "Split horizontally"
  },
  detach: {
    key: "workbench.tabs.detach",
    defaultMessage: "Detach"
  },
  close: {
    key: "workbench.tabs.close",
    defaultMessage: "Close"
  }
});

type SessionTab = {
  isBackground?: boolean;
  kind?: ProjectTabKind;
  sessionId?: string | null;
  status?: SessionStatus | null;
  tabId: string;
  title: string;
};

export type SessionTabDragPreview = {
  draggingTabId: string | null;
  dropIndex: number | null;
  dropPlacement: "before" | "after" | null;
  dropTabId: string | null;
  sourcePaneId: string | null;
  targetPaneId: string | null;
};

type SessionTabsProps = {
  busy: boolean;
  defaultProfileId: string;
  dragPreview?: SessionTabDragPreview;
  paneId: string;
  profiles: readonly ShellProfile[];
  tabs: SessionTab[];
  selectedTabId: string | null;
  onCreateSession: () => void;
  onCreateSessionWithProfile: (profileId: string) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onDetachTab?: (tabId: string, sessionId: string) => void;
  onMoveTab?: (
    sourcePaneId: string,
    tabId: string,
    targetPaneId: string,
    targetIndex: number
  ) => void;
  onMoveTabToNewWindow?: (
    sourcePaneId: string,
    tabId: string,
    releasePoint: { x: number; y: number }
  ) => void;
  onMoveTabPreviewChange?: (preview: SessionTabDragPreview) => void;
  onRenameTab?: (tabId: string, sessionId: string) => void;
  onSplitPane?: (direction: "horizontal" | "vertical") => void;
};

type PointerTabDrag = {
  isDragging: boolean;
  pointerId: number;
  sourcePaneId: string;
  startX: number;
  startY: number;
  tabId: string;
  targetIndex: number | null;
  targetPaneId: string | null;
  cleanup: () => void;
};

export function createEmptyTabDragPreview(): SessionTabDragPreview {
  return {
    draggingTabId: null,
    dropIndex: null,
    dropPlacement: null,
    dropTabId: null,
    sourcePaneId: null,
    targetPaneId: null
  };
}

export function SessionTabs({
  busy,
  defaultProfileId,
  dragPreview,
  paneId,
  profiles,
  tabs,
  selectedTabId,
  onCreateSession,
  onCreateSessionWithProfile,
  onSelectTab,
  onCloseTab,
  onDetachTab,
  onMoveTab,
  onMoveTabToNewWindow,
  onMoveTabPreviewChange,
  onRenameTab,
  onSplitPane
}: SessionTabsProps) {
  const t = useT();
  const tabStripRef = useRef<HTMLElement | null>(null);
  const tabStripTrackRef = useRef<HTMLDivElement | null>(null);
  const profileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const pointerDragRef = useRef<PointerTabDrag | null>(null);
  const suppressNextTabClickRef = useRef<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const [profileMenuStyle, setProfileMenuStyle] = useState<CSSProperties>({});
  const [localDragPreview, setLocalDragPreview] = useState<SessionTabDragPreview>(
    createEmptyTabDragPreview
  );
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

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".tab-context-menu")) {
        return;
      }

      setContextMenuState(null);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setContextMenuState(null);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenuState]);

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

  function handleCreateSession() {
    setIsProfileMenuOpen(false);
    onCreateSession();
  }

  function handleToggleProfileMenu() {
    const nextOpen = !isProfileMenuOpen;
    setIsProfileMenuOpen(nextOpen);

    if (!nextOpen) {
      return;
    }

    const rect = profileMenuButtonRef.current?.getBoundingClientRect();
    if (!rect) {
      setProfileMenuStyle({});
      return;
    }

    setProfileMenuStyle({
      left: Math.max(0, rect.right - 220),
      top: rect.bottom + 8
    });
  }

  function handleCreateSessionWithProfile(profileId: string) {
    setIsProfileMenuOpen(false);
    onCreateSessionWithProfile(profileId);
  }

  function handleOpenTabContextMenu(event: ReactMouseEvent<HTMLDivElement>, tabId: string) {
    event.preventDefault();
    setIsProfileMenuOpen(false);
    setContextMenuState({
      tabId,
      x: event.clientX,
      y: event.clientY
    });
  }

  function handleCloseContextMenu() {
    setContextMenuState(null);
  }

  function handleTabPointerDown(event: ReactPointerEvent<HTMLDivElement>, tabId: string) {
    if ((!onMoveTab && !onMoveTabToNewWindow) || event.button !== 0 || isCloseButtonEvent(event)) {
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    const drag: PointerTabDrag = {
      cleanup: () => undefined,
      isDragging: false,
      pointerId: event.pointerId,
      sourcePaneId: paneId,
      startX: event.clientX,
      startY: event.clientY,
      tabId,
      targetIndex: null,
      targetPaneId: null
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== drag.pointerId) {
        return;
      }

      const deltaX = moveEvent.clientX - drag.startX;
      const deltaY = moveEvent.clientY - drag.startY;
      if (!drag.isDragging && Math.hypot(deltaX, deltaY) < POINTER_DRAG_THRESHOLD_PX) {
        return;
      }

      moveEvent.preventDefault();
      drag.isDragging = true;
      const dropTarget = isOutsideViewport(moveEvent.clientX, moveEvent.clientY)
        ? null
        : getPointerDropTarget(moveEvent.clientX, moveEvent.clientY);
      drag.targetPaneId = dropTarget?.paneId ?? null;
      drag.targetIndex = dropTarget?.index ?? null;
      updateDragPreview({
        draggingTabId: tabId,
        dropIndex: dropTarget?.index ?? null,
        dropPlacement: dropTarget?.placement ?? null,
        dropTabId: dropTarget?.tabId ?? null,
        sourcePaneId: drag.sourcePaneId,
        targetPaneId: dropTarget?.paneId ?? null
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== drag.pointerId) {
        return;
      }

      if (drag.isDragging && drag.targetPaneId !== null && drag.targetIndex !== null && onMoveTab) {
        upEvent.preventDefault();
        suppressNextTabClickRef.current = tabId;
        onMoveTab(drag.sourcePaneId, drag.tabId, drag.targetPaneId, drag.targetIndex);
      } else if (drag.isDragging && isOutsideViewport(upEvent.clientX, upEvent.clientY)) {
        upEvent.preventDefault();
        suppressNextTabClickRef.current = tabId;
        onMoveTabToNewWindow?.(drag.sourcePaneId, drag.tabId, {
          x: upEvent.clientX,
          y: upEvent.clientY
        });
      } else if (!drag.isDragging) {
        suppressNextTabClickRef.current = tabId;
        onSelectTab(drag.tabId);
      }
      drag.cleanup();
      pointerDragRef.current = null;
      clearDragState();
    };

    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== drag.pointerId) {
        return;
      }

      drag.cleanup();
      pointerDragRef.current = null;
      clearDragState();
    };

    drag.cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
    pointerDragRef.current = drag;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    setIsProfileMenuOpen(false);
    setContextMenuState(null);
  }

  function handleSelectTabClick(tabId: string) {
    if (suppressNextTabClickRef.current === tabId) {
      suppressNextTabClickRef.current = null;
      return;
    }

    onSelectTab(tabId);
  }

  function clearDragState() {
    updateDragPreview(createEmptyTabDragPreview());
  }

  function updateDragPreview(nextPreview: SessionTabDragPreview) {
    if (onMoveTabPreviewChange) {
      onMoveTabPreviewChange(nextPreview);
      return;
    }

    setLocalDragPreview(nextPreview);
  }

  const contextTab = contextMenuState
    ? tabs.find((tab) => tab.tabId === contextMenuState.tabId)
    : null;
  const contextSessionId = contextTab?.sessionId ?? null;
  const canRenameContextTab =
    contextTab?.kind === "terminal" && contextSessionId !== null && Boolean(onRenameTab);
  const canDetachContextTab =
    contextTab?.kind === "terminal" &&
    contextSessionId !== null &&
    contextTab.status === "running" &&
    Boolean(onDetachTab);
  const currentDragPreview = dragPreview ?? localDragPreview;
  const isDropTargetPane = currentDragPreview.targetPaneId === paneId;

  return (
    <div className="tab-strip-shell">
      <nav
        ref={tabStripRef}
        aria-label={t(SESSION_TAB_MESSAGES.ariaLabel)}
        className="tab-strip"
        onScroll={syncThumbMetrics}
        onWheel={handleWheel}
      >
        <div
          ref={tabStripTrackRef}
          className={`tab-strip-track ${
            isDropTargetPane &&
            currentDragPreview.dropIndex === tabs.length &&
            currentDragPreview.dropTabId === null
              ? "tab-strip-track-drop-end"
              : ""
          }`}
          data-tab-strip-pane-id={paneId}
          data-tab-strip-tab-count={tabs.length}
        >
          {tabs.map((tab, index) => (
            <div
              key={tab.tabId}
              className={[
                "tab",
                tab.tabId === selectedTabId ? "tab-active" : "",
                currentDragPreview.sourcePaneId === paneId &&
                tab.tabId === currentDragPreview.draggingTabId
                  ? "tab-dragging"
                  : "",
                isDropTargetPane &&
                tab.tabId === currentDragPreview.dropTabId &&
                currentDragPreview.dropPlacement === "before"
                  ? "tab-drop-before"
                  : "",
                isDropTargetPane &&
                tab.tabId === currentDragPreview.dropTabId &&
                currentDragPreview.dropPlacement === "after"
                  ? "tab-drop-after"
                  : ""
              ]
                .filter(Boolean)
                .join(" ")}
              data-pane-id={paneId}
              data-tab-id={tab.tabId}
              data-tab-index={index}
              onContextMenu={(event) => handleOpenTabContextMenu(event, tab.tabId)}
              onPointerDown={(event) => handleTabPointerDown(event, tab.tabId)}
            >
              <button
                className="tab-button"
                onClick={() => handleSelectTabClick(tab.tabId)}
                type="button"
              >
                <span className="tab-title">
                  {tab.isBackground ? (
                    <span aria-hidden="true" className="tab-background-marker">
                      👻
                    </span>
                  ) : null}
                  {tab.title}
                </span>
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
          <div className="sidebar-split-button tab-strip-new-session">
            <button
              aria-label={t(SESSION_TAB_MESSAGES.createSession)}
              className="sidebar-split-button-segment sidebar-split-button-primary"
              disabled={busy}
              onClick={handleCreateSession}
              type="button"
            >
              <Plus aria-hidden="true" size={14} strokeWidth={2} />
            </button>
            <button
              ref={profileMenuButtonRef}
              aria-label={t(SESSION_TAB_MESSAGES.openShellProfiles)}
              className="sidebar-split-button-segment sidebar-split-button-toggle"
              disabled={busy}
              onClick={handleToggleProfileMenu}
              type="button"
            >
              <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
            </button>
            {isProfileMenuOpen ? (
              <div
                className="app-menu sidebar-menu tab-strip-profile-menu"
                role="menu"
                style={profileMenuStyle}
              >
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    className="app-menu-item sidebar-menu-item"
                    onClick={() => handleCreateSessionWithProfile(profile.id)}
                    role="menuitem"
                    type="button"
                  >
                    <span>{profile.name}</span>
                    {profile.id === defaultProfileId ? (
                      <span className="sidebar-menu-badge">
                        {t(SESSION_TAB_MESSAGES.defaultProfile)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
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
      {contextMenuState && contextTab ? (
        <div
          className="app-menu tab-context-menu"
          role="menu"
          style={
            {
              left: `${contextMenuState.x}px`,
              top: `${contextMenuState.y}px`
            } as CSSProperties
          }
        >
          {canRenameContextTab ? (
            <button
              className="app-menu-item"
              onClick={() => {
                onRenameTab?.(contextTab.tabId, contextSessionId);
                handleCloseContextMenu();
              }}
              role="menuitem"
              type="button"
            >
              <span>{t(SESSION_TAB_MESSAGES.rename)}</span>
            </button>
          ) : null}
          <button
            className="app-menu-item"
            onClick={() => {
              onSplitPane?.("vertical");
              handleCloseContextMenu();
            }}
            role="menuitem"
            type="button"
          >
            <span>{t(SESSION_TAB_MESSAGES.splitVertical)}</span>
          </button>
          <button
            className="app-menu-item"
            onClick={() => {
              onSplitPane?.("horizontal");
              handleCloseContextMenu();
            }}
            role="menuitem"
            type="button"
          >
            <span>{t(SESSION_TAB_MESSAGES.splitHorizontal)}</span>
          </button>
          {canDetachContextTab ? (
            <button
              className="app-menu-item"
              onClick={() => {
                onDetachTab?.(contextTab.tabId, contextSessionId);
                handleCloseContextMenu();
              }}
              role="menuitem"
              type="button"
            >
              <span>{t(SESSION_TAB_MESSAGES.detach)}</span>
            </button>
          ) : null}
          <button
            className="app-menu-item"
            onClick={() => {
              onCloseTab(contextTab.tabId);
              handleCloseContextMenu();
            }}
            role="menuitem"
            type="button"
          >
            <span>{t(SESSION_TAB_MESSAGES.close)}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function isCloseButtonEvent(event: ReactPointerEvent<HTMLDivElement>): boolean {
  const target = event.target;
  return target instanceof Element && Boolean(target.closest(".tab-close-button"));
}

function isOutsideViewport(clientX: number, clientY: number): boolean {
  return clientX < 0 || clientY < 0 || clientX > window.innerWidth || clientY > window.innerHeight;
}

function getPointerDropTarget(
  clientX: number,
  clientY: number
): {
  index: number;
  paneId: string;
  placement: "before" | "after" | null;
  tabId: string | null;
} | null {
  const hitElement = document.elementFromPoint(clientX, clientY);
  if (!(hitElement instanceof Element)) {
    return null;
  }

  const tabElement = hitElement.closest<HTMLElement>("[data-tab-id][data-tab-index][data-pane-id]");
  if (tabElement) {
    const index = Number(tabElement.dataset.tabIndex);
    const paneId = tabElement.dataset.paneId;
    const tabId = tabElement.dataset.tabId;
    if (!Number.isFinite(index) || !paneId || !tabId) {
      return null;
    }

    const rect = tabElement.getBoundingClientRect();
    const placement = clientX < rect.left + rect.width / 2 ? "before" : "after";
    return {
      index: placement === "after" ? index + 1 : index,
      paneId,
      placement,
      tabId
    };
  }

  const trackElement = hitElement.closest<HTMLElement>("[data-tab-strip-pane-id]");
  if (!trackElement) {
    return null;
  }

  const tabCount = Number(trackElement.dataset.tabStripTabCount);
  const paneId = trackElement.dataset.tabStripPaneId;
  return Number.isFinite(tabCount) && paneId
    ? {
        index: tabCount,
        paneId,
        placement: null,
        tabId: null
      }
    : null;
}
