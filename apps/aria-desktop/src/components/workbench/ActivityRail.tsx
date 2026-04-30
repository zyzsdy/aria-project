import { Ellipsis, FolderKanban, PanelsTopLeft, SquareStack, type LucideIcon } from "lucide-react";
import { defineMessages } from "../../i18n/messages";
import { useT } from "../../i18n/react";
import { toggleSidebar, type RailAction, type SidebarPanel } from "./sidebar/sidebarState";

type RailItem = {
  action: RailAction;
  icon: LucideIcon;
  labelKey: keyof typeof RAIL_ITEM_MESSAGES;
  size: number;
};

const RAIL_ITEM_MESSAGES = defineMessages({
  sessions: {
    key: "workbench.activity_rail.sessions",
    defaultMessage: "Sessions"
  },
  projects: {
    key: "workbench.activity_rail.projects",
    defaultMessage: "Projects"
  },
  collections: {
    key: "workbench.activity_rail.collections",
    defaultMessage: "Collections"
  }
});

const ACTIVITY_RAIL_MESSAGES = defineMessages({
  ariaLabel: {
    key: "workbench.activity_rail.aria_label",
    defaultMessage: "Workbench sections"
  },
  openMenu: {
    key: "workbench.activity_rail.open_menu",
    defaultMessage: "Open menu"
  },
  menu: {
    key: "common.labels.menu",
    defaultMessage: "Menu"
  },
  settings: {
    key: "common.labels.settings",
    defaultMessage: "Settings"
  },
  checkForUpdates: {
    key: "common.labels.check_for_updates",
    defaultMessage: "Check for Updates"
  },
  about: {
    key: "common.labels.about",
    defaultMessage: "About"
  }
});

const PRIMARY_ITEMS: RailItem[] = [
  { action: "projects", icon: SquareStack, labelKey: "projects", size: 26 },
  { action: "sessions", icon: PanelsTopLeft, labelKey: "sessions", size: 26 },
  { action: "collections", icon: FolderKanban, labelKey: "collections", size: 26 }
];

type ActivityRailProps = {
  openSidebar: SidebarPanel | null;
  isToolMenuOpen: boolean;
  onOpenSidebarChange: (next: SidebarPanel | null) => void;
  onToolMenuOpenChange: (next: boolean) => void;
  onSettings: () => void;
  onCheckForUpdates: () => void;
  onAbout: () => void;
};

export function ActivityRail({
  openSidebar,
  isToolMenuOpen,
  onOpenSidebarChange,
  onToolMenuOpenChange,
  onSettings,
  onCheckForUpdates,
  onAbout
}: ActivityRailProps) {
  const t = useT();

  return (
    <aside className="activity-rail" aria-label={t(ACTIVITY_RAIL_MESSAGES.ariaLabel)}>
      <div className="rail-group">
        {PRIMARY_ITEMS.map((item) => (
          <RailButton
            key={item.action}
            isActive={openSidebar === item.action}
            item={item}
            label={t(RAIL_ITEM_MESSAGES[item.labelKey])}
            onClick={() => onOpenSidebarChange(toggleSidebar(openSidebar, item.action))}
          />
        ))}
      </div>

      <div className="rail-group rail-group-bottom">
        <div className="rail-entry">
          <button
            aria-label={t(ACTIVITY_RAIL_MESSAGES.openMenu)}
            className={`rail-button ${isToolMenuOpen ? "rail-button-active" : ""}`}
            onClick={() => onToolMenuOpenChange(!isToolMenuOpen)}
            type="button"
          >
            <Ellipsis aria-hidden="true" size={22} strokeWidth={1.9} />
          </button>
          <span className="rail-tooltip" role="tooltip">
            {t(ACTIVITY_RAIL_MESSAGES.menu)}
          </span>
          {isToolMenuOpen ? (
            <div className="app-menu rail-menu" role="menu">
              <button
                className="app-menu-item rail-menu-item"
                onClick={onSettings}
                role="menuitem"
                type="button"
              >
                {t(ACTIVITY_RAIL_MESSAGES.settings)}
              </button>
              <button
                className="app-menu-item rail-menu-item"
                onClick={onCheckForUpdates}
                role="menuitem"
                type="button"
              >
                {t(ACTIVITY_RAIL_MESSAGES.checkForUpdates)}
              </button>
              <button
                className="app-menu-item rail-menu-item"
                onClick={onAbout}
                role="menuitem"
                type="button"
              >
                {t(ACTIVITY_RAIL_MESSAGES.about)}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

type RailButtonProps = {
  isActive: boolean;
  item: RailItem;
  label: string;
  onClick: () => void;
};

function RailButton({ isActive, item, label, onClick }: RailButtonProps) {
  const Icon = item.icon;

  return (
    <div className="rail-entry">
      <button
        aria-label={label}
        className={`rail-button ${isActive ? "rail-button-active" : ""}`}
        onClick={onClick}
        type="button"
      >
        <Icon aria-hidden="true" size={item.size} strokeWidth={1.9} />
      </button>
      <span className="rail-tooltip" role="tooltip">
        {label}
      </span>
    </div>
  );
}
