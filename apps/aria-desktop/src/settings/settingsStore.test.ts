import { describe, expect, it } from "vitest";
import type {
  AppSettings,
  SettingsGroup,
  UpdateAppSettingsPayload
} from "@aria/types";
import { DEFAULT_APP_SETTINGS } from "@aria/types";
import { createSettingsStore, type SettingsApi } from "./settingsStore";

describe("createSettingsStore", () => {
  it("loads default settings from the daemon when initialized", async () => {
    const store = createSettingsStore({
      get: async () => structuredClone(DEFAULT_APP_SETTINGS),
      update: async (payload) => mergeSettings(DEFAULT_APP_SETTINGS, payload),
      resetGroup: async () => structuredClone(DEFAULT_APP_SETTINGS)
    });

    await store.load();

    expect(store.getSnapshot()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("updates one field without clobbering other groups", async () => {
    const store = createSettingsStore(createFakeApi());
    await store.load();

    await store.update({
      appearance: {
        fontSize: 16
      }
    });

    expect(store.getSnapshot()).toMatchObject({
      appearance: {
        fontSize: 16
      },
      terminal: DEFAULT_APP_SETTINGS.terminal,
      workspace: DEFAULT_APP_SETTINGS.workspace
    });
  });

  it("resets only the requested group", async () => {
    const store = createSettingsStore(createFakeApi());
    await store.load();
    await store.update({
      appearance: {
        fontSize: 16
      },
      terminal: {
        bellMode: "visual"
      }
    });

    await store.resetGroup("appearance");

    expect(store.getSnapshot()).toMatchObject({
      appearance: DEFAULT_APP_SETTINGS.appearance,
      terminal: {
        bellMode: "visual"
      }
    });
  });
});

function createFakeApi(): SettingsApi {
  let current = structuredClone(DEFAULT_APP_SETTINGS);

  return {
    get: async () => structuredClone(current),
    update: async (payload) => {
      current = mergeSettings(current, payload);
      return structuredClone(current);
    },
    resetGroup: async (group: SettingsGroup) => {
      current = {
        ...current,
        [group]: structuredClone(DEFAULT_APP_SETTINGS[group])
      };
      return structuredClone(current);
    }
  };
}

function mergeSettings(
  current: AppSettings,
  payload: UpdateAppSettingsPayload
): AppSettings {
  return {
    appearance: {
      ...current.appearance,
      ...payload.appearance
    },
    terminal: {
      ...current.terminal,
      ...payload.terminal
    },
    workspace: {
      ...current.workspace,
      ...payload.workspace
    }
  };
}
