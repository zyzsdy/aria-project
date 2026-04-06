import type { MessageDescriptor } from "../../../i18n/messages";
import { defineMessages } from "../../../i18n/messages";
import type { MessageValues } from "../../../i18n/runtime";
import type { HtmlPageId } from "./tabState";

type TranslateMessage = (message: MessageDescriptor, values?: MessageValues) => string;

const HTML_PAGE_TITLE_MESSAGES = defineMessages({
  settings: {
    key: "workbench.tabs.settings_tab",
    defaultMessage: "Settings"
  }
});

export function getHtmlPageTitle(pageId: HtmlPageId, t: TranslateMessage) {
  switch (pageId) {
    case "settings":
      return t(HTML_PAGE_TITLE_MESSAGES.settings);
  }
}
