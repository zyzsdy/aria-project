import type { ReactNode } from "react";

type UtilityPanelHostProps = {
  children?: ReactNode;
  isVisible: boolean;
};

export function UtilityPanelHost({
  children,
  isVisible
}: UtilityPanelHostProps) {
  if (!isVisible) {
    return null;
  }

  return <aside className="utility-panel">{children}</aside>;
}
