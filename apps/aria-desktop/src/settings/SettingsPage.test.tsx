// @vitest-environment jsdom

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { createPlatformDefaultSettings } from "./appSettings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("SettingsPage", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
    }

    container?.remove();
    container = null;
    root = null;
  });

  it("renders the profiles section with builtin and custom profile controls", () => {
    const settings = createPlatformDefaultSettings("windows");
    const markup = renderToStaticMarkup(
      <SettingsPage
        onResetGroup={() => undefined}
        onSelectGroup={() => undefined}
        onUpdate={() => undefined}
        selectedGroup="profiles"
        settings={{
          ...settings,
          profiles: {
            defaultProfileId: "builtin:powershell",
            items: [
              ...settings.profiles.items,
              {
                id: "custom:fish",
                source: "custom",
                name: "Fish",
                executable: "fish",
                args: ["--login"],
                startupDir: "D:/shells"
              }
            ]
          }
        }}
      />
    );

    expect(markup).toContain("Profiles");
    expect(markup).toContain("Default profile");
    expect(markup).toContain("Add profile");
    expect(markup).toContain("PowerShell");
    expect(markup).toContain("Command Prompt");
    expect(markup).toContain("Fish");
    expect(markup).toContain("Delete Fish");
    expect(markup).not.toContain("Delete PowerShell");
    expect(markup).toContain("Startup directory");
  });

  it("preserves spaces while editing the arguments field", () => {
    renderSettingsPage();

    const argumentsInput = findInputByLabel("Arguments");
    expect(argumentsInput).not.toBeNull();

    act(() => {
      setNativeInputValue(argumentsInput!, "pwsh ");
      argumentsInput!.dispatchEvent(new InputEvent("input", { bubbles: true, data: " " }));
    });

    expect(argumentsInput!.value).toBe("pwsh ");
  });

  function renderSettingsPage(node?: ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        node ?? <SettingsPageHarness />
      );
    });
  }

  function findInputByLabel(label: string) {
    const field = Array.from(container?.querySelectorAll(".settings-field") ?? []).find(
      (candidate) => candidate.textContent?.includes(label)
    );

    return field?.querySelector("input") ?? null;
  }
});

function SettingsPageHarness() {
  const [settings, setSettings] = useState(() => ({
    ...createPlatformDefaultSettings("windows"),
    profiles: {
      defaultProfileId: "builtin:powershell",
      items: [
        ...createPlatformDefaultSettings("windows").profiles.items,
        {
          id: "custom:fish",
          source: "custom" as const,
          name: "Fish",
          executable: "fish",
          args: ["--login"],
          startupDir: "D:/shells"
        }
      ]
    }
  }));

  return (
    <SettingsPage
      onResetGroup={() => undefined}
      onSelectGroup={() => undefined}
      onUpdate={(next) =>
        setSettings((current) => ({
          appearance: {
            ...current.appearance,
            ...next.appearance
          },
          terminal: {
            ...current.terminal,
            ...next.terminal
          },
          workspace: {
            ...current.workspace,
            ...next.workspace
          },
          localization: {
            ...current.localization,
            ...next.localization
          },
          profiles: next.profiles
            ? {
                ...current.profiles,
                ...next.profiles,
                items: next.profiles.items ? [...next.profiles.items] : current.profiles.items
              }
            : current.profiles
        }))
      }
      selectedGroup="profiles"
      settings={settings}
    />
  );
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
}
