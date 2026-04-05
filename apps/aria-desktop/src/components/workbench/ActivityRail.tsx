import { Ellipsis, FolderKanban, PanelsTopLeft, type LucideIcon } from "lucide-react";
import {
  toggleSidebar,
  type RailAction,
  type SidebarPanel
} from "./sidebar/sidebarState";

type RailItem = {
  action: RailAction;
  icon: LucideIcon;
  label: string;
  size: number;
};

const PRIMARY_ITEMS: RailItem[] = [
  { action: "sessions", icon: PanelsTopLeft, label: "Sessions", size: 26 },
  { action: "collections", icon: FolderKanban, label: "Collections", size: 26 }
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
  return (
    <aside className="activity-rail" aria-label="Workbench sections">
      <div className="rail-group">
        {PRIMARY_ITEMS.map((item) => (
          <RailButton
            key={item.action}
            isActive={openSidebar === item.action}
            item={item}
            onClick={() => onOpenSidebarChange(toggleSidebar(openSidebar, item.action))}
          />
        ))}
      </div>

      <div className="rail-group rail-group-bottom">
        <div className="rail-entry">
          <button
            aria-label="Open tools menu"
            className={`rail-button ${isToolMenuOpen ? "rail-button-active" : ""}`}
            onClick={() => onToolMenuOpenChange(!isToolMenuOpen)}
            type="button"
          >
            <Ellipsis aria-hidden="true" size={22} strokeWidth={1.9} />
          </button>
          <span className="rail-tooltip" role="tooltip">
            Tools
          </span>
          {isToolMenuOpen ? (
            <div className="rail-menu" role="menu">
              <button className="rail-menu-item" onClick={onSettings} role="menuitem" type="button">
                Settings
              </button>
              <button className="rail-menu-item" onClick={onCheckForUpdates} role="menuitem" type="button">
                Check for Updates
              </button>
              <button className="rail-menu-item" onClick={onAbout} role="menuitem" type="button">
                About
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
  onClick: () => void;
};

function RailButton({ isActive, item, onClick }: RailButtonProps) {
  const Icon = item.icon;

  return (
    <div className="rail-entry">
      <button
        aria-label={item.label}
        className={`rail-button ${isActive ? "rail-button-active" : ""}`}
        onClick={onClick}
        type="button"
      >
        <Icon aria-hidden="true" size={item.size} strokeWidth={1.9} />
      </button>
      <span className="rail-tooltip" role="tooltip">
        {item.label}
      </span>
    </div>
  );
}
