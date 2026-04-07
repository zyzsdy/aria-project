import type { AppSettings, SettingsGroup, UpdateAppSettingsPayload } from "@aria/types";
import { cloneSettings } from "./appSettings";
import { DEFAULT_APP_SETTINGS } from "./appSettings";

export type SettingsApi = {
  get: () => Promise<AppSettings>;
  update: (payload: UpdateAppSettingsPayload) => Promise<AppSettings>;
  resetGroup: (group: SettingsGroup) => Promise<AppSettings>;
};

type Listener = (snapshot: AppSettings) => void;

export function createSettingsStore(api: SettingsApi) {
  let snapshot = cloneSettings(DEFAULT_APP_SETTINGS);
  const listeners = new Set<Listener>();

  function emit() {
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  return {
    async load() {
      snapshot = cloneSettings(await api.get());
      emit();
      return snapshot;
    },
    async update(payload: UpdateAppSettingsPayload) {
      snapshot = cloneSettings(await api.update(payload));
      emit();
      return snapshot;
    },
    async resetGroup(group: SettingsGroup) {
      snapshot = cloneSettings(await api.resetGroup(group));
      emit();
      return snapshot;
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
