import type { HealthResponse } from "@aria/types";
import { invoke, isTauri } from "@tauri-apps/api/core";
import desktopPackage from "../../../package.json";

export type AboutRuntimeInfo = {
  webviewVersion: string | null;
};

export type AboutDialogState = {
  desktopVersion: string;
  webviewVersion: string | null;
  ariaCoreVersion: string | null;
  isAriaCoreConnected: boolean;
};

export const DEFAULT_ABOUT_DIALOG_STATE: AboutDialogState = {
  desktopVersion: desktopPackage.version,
  webviewVersion: null,
  ariaCoreVersion: null,
  isAriaCoreConnected: false
};

export async function loadAboutDialogState(): Promise<AboutDialogState> {
  const [runtimeResult, healthResult] = await Promise.allSettled([
    loadAboutRuntimeInfo(),
    invoke<HealthResponse>("daemon_health")
  ]);

  return {
    desktopVersion: desktopPackage.version,
    webviewVersion:
      runtimeResult.status === "fulfilled" ? runtimeResult.value.webviewVersion : null,
    ariaCoreVersion: healthResult.status === "fulfilled" ? healthResult.value.app.version : null,
    isAriaCoreConnected: healthResult.status === "fulfilled"
  };
}

export async function openAboutExternalLink(url: string) {
  if (isTauri()) {
    await invoke("open_external_url", { url });
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

async function loadAboutRuntimeInfo(): Promise<AboutRuntimeInfo> {
  if (!isTauri()) {
    return { webviewVersion: null };
  }

  return invoke<AboutRuntimeInfo>("get_about_runtime_info");
}
