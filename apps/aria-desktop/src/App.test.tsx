// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectWorkspace, SessionSummary } from "@aria/types";
import { createPlatformDefaultSettings } from "./settings/appSettings";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

vi.mock("./components/workbench/main/TerminalTabSurface", () => ({
  TerminalTabSurface: () => null
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

class ResizeObserverStub {
  observe() {}

  disconnect() {}

  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  writable: true,
  value: ResizeObserverStub
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => ({
    fillRect() {},
    createLinearGradient() {
      return {
        addColorStop() {}
      };
    },
    getImageData() {
      return {
        data: new Uint8ClampedArray(4)
      };
    }
  })
});

describe("App", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let AppComponent: typeof import("./App").App;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(async () => {
    invokeMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    AppComponent = (await import("./App")).App;
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
    }

    container?.remove();
    container = null;
    root = null;
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = null;
  });

  it("shows a modal when launching a configured shell profile fails", async () => {
    const settings = createPlatformDefaultSettings("windows");
    const brokenProfile = {
      id: "custom:broken",
      source: "custom" as const,
      name: "Broken Shell",
      executable: "missing-shell.exe",
      args: ["--bad"],
      startupDir: "C:/missing"
    };

    invokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      switch (command) {
        case "get_app_settings":
          return {
            ...settings,
            profiles: {
              ...settings.profiles,
              items: [...settings.profiles.items, brokenProfile]
            }
          };
        case "get_project_workspace":
          return createProjectWorkspace();
        case "list_sessions":
          return [];
        case "create_local_session":
          expect(payload).toEqual({
            cols: 120,
            rows: 32,
            profileId: "custom:broken"
          });
          throw "spawn PTY command [\"missing-shell.exe\", \"--bad\"]: The system cannot find the file specified. (os error 2)";
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    renderApp();
    await flushAsyncWork();
    await openSessionsSidebar();

    const menuButton = await waitForButton("Open shell profiles");
    act(() => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    const profileButton = await waitForButton("Broken Shell");
    act(() => {
      profileButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    const dialog = container?.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Unable to create session");
    expect(dialog?.textContent).toContain(
      "spawn PTY command [\"missing-shell.exe\", \"--bad\"]"
    );
  });

  it("removes a terminated sidebar session while preserving the project tab placeholder", async () => {
    const settings = createPlatformDefaultSettings("windows");
    const session = createSessionSummary("session-a", "Alpha");
    let sessions: SessionSummary[] = [session];
    let workspace = createProjectWorkspace();
    let resolveCloseSession: () => void = () => undefined;
    const closeSessionPromise = new Promise<void>((resolve) => {
      resolveCloseSession = resolve;
    });

    invokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      switch (command) {
        case "get_app_settings":
          return settings;
        case "get_project_workspace":
          return workspace;
        case "update_project_layout":
          {
            const request = payload?.request as {
              activePaneId: string;
              layout: ProjectWorkspace["projects"][number]["layout"];
              projectId: string;
            };
          workspace = {
            ...workspace,
            projects: workspace.projects.map((project) =>
              project.projectId === request.projectId
                ? {
                    ...project,
                    activePaneId: request.activePaneId,
                    layout: request.layout
                  }
                : project
            )
          };
          return workspace;
          }
        case "list_sessions":
          return sessions;
        case "close_session":
          expect(payload).toEqual({ sessionId: "session-a" });
          return closeSessionPromise;
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    renderApp();
    await flushAsyncWork();
    await openSessionsSidebar();
    await waitForElement(".sidebar-tree-row");
    expect(container?.textContent).toContain("Alpha");

    act(() => {
      container
        ?.querySelector(".sidebar-tree-row")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    await flushAsyncWork();

    const terminateButton = await waitForButton("Terminate");
    act(() => {
      terminateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(invokeMock).toHaveBeenCalledWith("close_session", { sessionId: "session-a" });
    expect(container?.querySelector(".sidebar-tree-row")).toBeNull();
    expect(container?.textContent).toContain("Session unavailable");
    expect(container?.textContent).toContain("Alpha");

    sessions = [];
    resolveCloseSession();
    await flushAsyncWork();

    expect(invokeMock.mock.calls.filter(([command]) => command === "close_session")).toHaveLength(
      1
    );
    expect(container?.textContent).toContain("Session unavailable");
  });

  it("uses app dialogs instead of window prompts for creating and renaming projects", async () => {
    const settings = createPlatformDefaultSettings("windows");
    let workspace = createProjectWorkspace();
    const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => {
      throw new Error("window.prompt should not be used");
    });

    invokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      switch (command) {
        case "get_app_settings":
          return settings;
        case "list_sessions":
          return [];
        case "get_project_workspace":
          return workspace;
        case "create_project":
          expect(payload).toEqual({ name: "Client Work" });
          workspace = {
            activeProjectId: "project-b",
            projects: [
              ...workspace.projects,
              {
                projectId: "project-b",
                name: "Client Work",
                activePaneId: "pane-b",
                layout: {
                  type: "leaf",
                  paneId: "pane-b",
                  activeTabId: null,
                  tabs: []
                }
              }
            ]
          };
          return workspace.projects[1];
        case "rename_project":
          expect(payload).toEqual({ projectId: "project-a", name: "Renamed Project" });
          workspace = {
            ...workspace,
            projects: workspace.projects.map((project) =>
              project.projectId === "project-a"
                ? { ...project, name: "Renamed Project" }
                : project
            )
          };
          return workspace;
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    renderApp();
    await flushAsyncWork();

    const createButton = await waitForButton("Create project");
    act(() => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    let dialog = await waitForElement('[role="dialog"]');
    expect(dialog.textContent).toContain("Create project");
    setDialogInputValue("Client Work");
    const createConfirm = await waitForButton("Create");
    act(() => {
      createConfirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(invokeMock).toHaveBeenCalledWith("create_project", { name: "Client Work" });
    expect(promptSpy).not.toHaveBeenCalled();

    act(() => {
      container
        ?.querySelector(".project-row")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    await flushAsyncWork();

    const renameMenuItem = await waitForButton("Rename");
    act(() => {
      renameMenuItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    dialog = await waitForElement('[role="dialog"]');
    expect(dialog.textContent).toContain("Rename project");
    setDialogInputValue("Renamed Project");
    const renameConfirm = await waitForButton("Rename");
    act(() => {
      renameConfirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(invokeMock).toHaveBeenCalledWith("rename_project", {
      projectId: "project-a",
      name: "Renamed Project"
    });
    expect(promptSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("creates a default profile session from the active pane tab strip", async () => {
    const settings = createPlatformDefaultSettings("windows");
    const existingSession = createSessionSummary("session-existing", "Existing");
    const createdSession = createSessionSummary("session-from-tab", "PowerShell");
    let sessions: SessionSummary[] = [existingSession];
    let workspace = createProjectWorkspace({
      layout: {
        type: "leaf",
        paneId: "pane-a",
        activeTabId: "existing-tab",
        tabs: [
          {
            kind: "terminal",
            pageId: null,
            sessionId: "session-existing",
            tabId: "existing-tab",
            title: "Existing"
          }
        ]
      }
    });
    const staleBackendWorkspace = createProjectWorkspace();

    invokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      switch (command) {
        case "get_app_settings":
          return settings;
        case "list_sessions":
          return sessions;
        case "get_project_workspace":
          if (invokeMock.mock.calls.some(([calledCommand]) => calledCommand === "create_local_session")) {
            return staleBackendWorkspace;
          }
          return workspace;
        case "create_local_session":
          expect(payload).toEqual({
            cols: 120,
            rows: 32,
            profileId: settings.profiles.defaultProfileId
          });
          sessions = [existingSession, createdSession];
          return { sessionId: "session-from-tab", summary: createdSession };
        case "update_project_layout":
          {
            const request = payload?.request as {
              activePaneId: string;
              layout: ProjectWorkspace["projects"][number]["layout"];
              projectId: string;
            };
            expect(request.projectId).toBe("project-a");
            expect(request.activePaneId).toBe("pane-a");
            expect(request.layout).toMatchObject({
              type: "leaf",
              paneId: "pane-a",
              tabs: [
                expect.objectContaining({ sessionId: "session-existing" }),
                expect.objectContaining({ sessionId: "session-from-tab" })
              ]
            });
            workspace = {
              ...workspace,
              projects: workspace.projects.map((project) =>
                project.projectId === request.projectId
                  ? {
                      ...project,
                      activePaneId: request.activePaneId,
                      layout: request.layout
                    }
                  : project
              )
            };
            return workspace;
          }
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    renderApp();
    await flushAsyncWork();

    const createButton = await waitForButton("Create session");
    act(() => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitForInvoke("update_project_layout");

    expect(invokeMock).toHaveBeenCalledWith("create_local_session", {
      cols: 120,
      rows: 32,
      profileId: settings.profiles.defaultProfileId
    });
    expect(invokeMock).toHaveBeenCalledWith(
      "update_project_layout",
      expect.objectContaining({
        request: expect.objectContaining({
          activePaneId: "pane-a",
          projectId: "project-a"
        })
      })
    );
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "get_project_workspace")
    ).toHaveLength(1);
  });

  it("creates a selected profile session from the active pane tab strip menu", async () => {
    const settings = createPlatformDefaultSettings("windows");
    const customProfile = {
      id: "custom:git-bash",
      source: "custom" as const,
      name: "Git Bash",
      executable: "bash.exe",
      args: ["--login"],
      startupDir: "C:/work"
    };
    const settingsWithProfile = {
      ...settings,
      profiles: {
        ...settings.profiles,
        items: [...settings.profiles.items, customProfile]
      }
    };
    let sessions: SessionSummary[] = [];
    let workspace = createProjectWorkspace({
      activePaneId: "pane-b",
      layout: {
        type: "split",
        splitId: "split-a",
        direction: "horizontal",
        ratio: 0.5,
        first: {
          type: "leaf",
          paneId: "pane-a",
          activeTabId: null,
          tabs: []
        },
        second: {
          type: "leaf",
          paneId: "pane-b",
          activeTabId: null,
          tabs: []
        }
      }
    });

    invokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      switch (command) {
        case "get_app_settings":
          return settingsWithProfile;
        case "list_sessions":
          return sessions;
        case "get_project_workspace":
          return workspace;
        case "create_local_session":
          expect(payload).toEqual({
            cols: 120,
            rows: 32,
            profileId: "custom:git-bash"
          });
          {
            const createdSession = createSessionSummary("session-from-menu", "Git Bash");
            sessions = [createdSession];
            return { sessionId: "session-from-menu", summary: createdSession };
          }
        case "update_project_layout":
          {
            const request = payload?.request as {
              activePaneId: string;
              layout: ProjectWorkspace["projects"][number]["layout"];
              projectId: string;
            };
            expect(request.projectId).toBe("project-a");
            expect(request.activePaneId).toBe("pane-b");
            expect(request.layout).toMatchObject({
              type: "split",
              second: {
                type: "leaf",
                paneId: "pane-b",
                tabs: [expect.objectContaining({ sessionId: "session-from-menu" })]
              }
            });
            workspace = {
              ...workspace,
              projects: workspace.projects.map((project) =>
                project.projectId === request.projectId
                  ? {
                      ...project,
                      activePaneId: request.activePaneId,
                      layout: request.layout
                    }
                  : project
              )
            };
            return workspace;
          }
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    renderApp();
    await flushAsyncWork();

    const menuButton = await waitForButton("Open shell profiles");
    act(() => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    const profileButton = await waitForButton("Git Bash");
    act(() => {
      profileButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitForInvoke("update_project_layout");

    expect(invokeMock).toHaveBeenCalledWith("create_local_session", {
      cols: 120,
      rows: 32,
      profileId: "custom:git-bash"
    });
    expect(invokeMock).toHaveBeenCalledWith(
      "update_project_layout",
      expect.objectContaining({
        request: expect.objectContaining({
          activePaneId: "pane-b",
          projectId: "project-a"
        })
      })
    );
  });

  it("opens settings by activating an existing settings tab in the active project", async () => {
    const settings = createPlatformDefaultSettings("windows");
    const workspace = createProjectWorkspace({
      activePaneId: "pane-a",
      layout: {
        type: "split",
        splitId: "split-a",
        direction: "horizontal",
        ratio: 0.5,
        first: {
          type: "leaf",
          paneId: "pane-a",
          activeTabId: null,
          tabs: []
        },
        second: {
          type: "leaf",
          paneId: "pane-b",
          activeTabId: null,
          tabs: [
            {
              kind: "html",
              pageId: "settings",
              sessionId: null,
              tabId: "settings-tab",
              title: "Settings"
            }
          ]
        }
      }
    });

    invokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      switch (command) {
        case "get_app_settings":
          return settings;
        case "list_sessions":
          return [];
        case "get_project_workspace":
          return workspace;
        case "update_project_layout":
          expect(payload).toMatchObject({
            request: {
              projectId: "project-a",
              activePaneId: "pane-b"
            }
          });
          expect(
            (payload?.request as { layout: ProjectWorkspace["projects"][number]["layout"] }).layout
          ).toMatchObject({
            type: "split",
            second: {
              activeTabId: "settings-tab"
            }
          });
          return workspace;
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    renderApp();
    await flushAsyncWork();

    const menuButton = await waitForButton("Open menu");
    act(() => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    const settingsButton = await waitForButton("Settings");
    act(() => {
      settingsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(invokeMock).toHaveBeenCalledWith(
      "update_project_layout",
      expect.objectContaining({
        request: expect.objectContaining({
          activePaneId: "pane-b"
        })
      })
    );
  });

  function renderApp() {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(<AppComponent />);
    });
  }

  async function waitForButton(label: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const button = [...(container?.querySelectorAll("button") ?? [])].find((candidate) => {
        const ariaLabel = candidate.getAttribute("aria-label");
        return ariaLabel === label || candidate.textContent?.includes(label);
      });

      if (button instanceof HTMLButtonElement) {
        return button;
      }

      await flushAsyncWork();
    }

    throw new Error(`Unable to find button: ${label}`);
  }

  async function waitForElement(selector: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const element = container?.querySelector(selector);
      if (element) {
        return element;
      }

      await flushAsyncWork();
    }

    throw new Error(`Unable to find element: ${selector}`);
  }

  async function waitForInvoke(command: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (invokeMock.mock.calls.some(([calledCommand]) => calledCommand === command)) {
        return;
      }

      await flushAsyncWork();
    }

    throw new Error(`Unable to find invoke command: ${command}`);
  }

  function setDialogInputValue(value: string) {
    const input = container?.querySelector('[role="dialog"] input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Unable to find dialog input");
    }

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function openSessionsSidebar() {
    const sessionsButton = await waitForButton("Sessions");
    act(() => {
      sessionsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();
  }

  async function flushAsyncWork() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }
});

function createSessionSummary(sessionId: string, title: string): SessionSummary {
  return {
    sessionId,
    title,
    status: "running",
    transport: "local_pty",
    size: {
      cols: 120,
      rows: 32,
      pixelWidth: 0,
      pixelHeight: 0
    },
    createdAt: "1",
    updatedAt: "1"
  };
}

function createProjectWorkspace(
  overrides: Partial<ProjectWorkspace["projects"][number]> = {}
): ProjectWorkspace {
  return {
    activeProjectId: "project-a",
    projects: [
      {
        projectId: "project-a",
        name: "Default Project",
        activePaneId: "pane-a",
        layout: {
          type: "leaf",
          paneId: "pane-a",
          activeTabId: null,
          tabs: []
        },
        ...overrides
      }
    ]
  };
}
