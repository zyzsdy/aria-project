export type SidebarPanel = "sessions" | "collections";
export type RailAction = SidebarPanel | "settings";

export function toggleSidebar(
  openSidebar: SidebarPanel | null,
  action: RailAction
): SidebarPanel | null {
  if (action === "settings") {
    return openSidebar;
  }

  return openSidebar === action ? null : action;
}

export function toggleToolMenu(isOpen: boolean) {
  return !isOpen;
}
