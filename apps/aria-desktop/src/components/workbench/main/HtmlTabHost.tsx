import type { AppSettings, SettingsGroup } from "@aria/types";
import type { HtmlPageId } from "./tabState";
import { SettingsPage } from "../../../settings/SettingsPage";

type HtmlTabHostProps = {
  pageId: HtmlPageId;
  settings: AppSettings;
  selectedSettingsGroup: SettingsGroup;
  onSelectSettingsGroup: (group: SettingsGroup) => void;
  onUpdateSettings: (next: Partial<AppSettings>) => void;
  onResetSettingsGroup: (group: SettingsGroup) => void;
};

export function HtmlTabHost({
  pageId,
  settings,
  selectedSettingsGroup,
  onSelectSettingsGroup,
  onUpdateSettings,
  onResetSettingsGroup
}: HtmlTabHostProps) {
  const pages = {
    settings: (
      <SettingsPage
        onResetGroup={onResetSettingsGroup}
        onSelectGroup={onSelectSettingsGroup}
        onUpdate={onUpdateSettings}
        selectedGroup={selectedSettingsGroup}
        settings={settings}
      />
    )
  };

  return (
    <section className="html-tab-region">{pages[pageId]}</section>
  );
}
