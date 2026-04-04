import { FolderKanban, PanelsTopLeft, Settings2, type LucideIcon } from "lucide-react";
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

const SECONDARY_ITEMS: RailItem[] = [
  { action: "settings", icon: Settings2, label: "Settings", size: 22 }
];

type ActivityRailProps = {
  openSidebar: SidebarPanel | null;
  onOpenSidebarChange: (next: SidebarPanel | null) => void;
};

export function ActivityRail({
  openSidebar,
  onOpenSidebarChange
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
        {SECONDARY_ITEMS.map((item) => (
          <RailButton
            key={item.action}
            isActive={false}
            item={item}
            onClick={() => undefined}
          />
        ))}
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
