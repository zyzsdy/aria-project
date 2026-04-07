import { describe, expect, it } from "vitest";
import type {
  AppSettings,
  SettingsGroup,
  UpdateAppSettingsPayload
} from "@aria/types";
import { createPlatformDefaultSettings } from "./appSettings";
import { createSettingsStore, type SettingsApi } from "./settingsStore";

const DEFAULT_APP_SETTINGS = createPlatformDefaultSettings("windows");

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
      workspace: DEFAULT_APP_SETTINGS.workspace,
      localization: DEFAULT_APP_SETTINGS.localization
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

  it("updates and resets localization independently", async () => {
    const store = createSettingsStore(createFakeApi());
    await store.load();

    await store.update({
      localization: {
        locale: "ja-JP"
      }
    });

    expect(store.getSnapshot().localization).toEqual({
      locale: "ja-JP"
    });

    await store.resetGroup("localization");

    expect(store.getSnapshot().localization).toEqual(DEFAULT_APP_SETTINGS.localization);
  });

  it("updates and resets profiles independently", async () => {
    const store = createSettingsStore(createFakeApi());
    await store.load();

    await store.update({
      profiles: {
        defaultProfileId: "custom:fish",
        items: [
          ...store.getSnapshot().profiles.items,
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
    });

    expect(store.getSnapshot().profiles.defaultProfileId).toBe("custom:fish");
    expect(store.getSnapshot().profiles.items).toContainEqual({
      id: "custom:fish",
      source: "custom",
      name: "Fish",
      executable: "fish",
      args: ["--login"],
      startupDir: "D:/shells"
    });

    await store.resetGroup("profiles");

    expect(store.getSnapshot().profiles).toEqual(DEFAULT_APP_SETTINGS.profiles);
    expect(store.getSnapshot().appearance).toEqual(DEFAULT_APP_SETTINGS.appearance);
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
    },
    localization: {
      ...current.localization,
      ...payload.localization
    },
    profiles: {
      ...current.profiles,
      ...payload.profiles,
      items: payload.profiles?.items
        ? payload.profiles.items.map((profile) => ({
            ...profile,
            args: [...profile.args]
          }))
        : current.profiles.items
    }
  };
}
