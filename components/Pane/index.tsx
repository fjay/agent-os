"use client";

import { useRef, useCallback, useEffect, memo, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { usePanes } from "@/contexts/PaneContext";
import { useViewport } from "@/hooks/useViewport";
import type {
  TerminalHandle,
  TerminalScrollState,
} from "@/components/Terminal";
import type { Session, Project } from "@/lib/db";
import { getAllPaneIds, type TabData } from "@/lib/panes";
import { sessionRegistry } from "@/lib/client/session-registry";
import { getEffectiveWorkingDirectory } from "@/lib/session-path";
import { cn } from "@/lib/utils";
import { ConductorPanel } from "@/components/ConductorPanel";
import { useFileEditor } from "@/hooks/useFileEditor";
import {
  MobileTabBar,
  type MobileProjectGroup,
  type MobileTabListEntry,
} from "./MobileTabBar";
import { DesktopTabBar } from "./DesktopTabBar";
import {
  TerminalSkeleton,
  FileExplorerSkeleton,
  GitPanelSkeleton,
} from "./PaneSkeletons";
import {
  Panel as ResizablePanel,
  Group as ResizablePanelGroup,
  Separator as ResizablePanelHandle,
} from "react-resizable-panels";
import { GitDrawer } from "@/components/GitDrawer";
import { ShellDrawer } from "@/components/ShellDrawer";
import { useSnapshot } from "valtio";
import { fileOpenStore, fileOpenActions } from "@/stores/fileOpen";

// Dynamic imports for client-only components with loading states
const Terminal = dynamic(
  () => import("@/components/Terminal").then((mod) => mod.Terminal),
  { ssr: false, loading: () => <TerminalSkeleton /> }
);

const FileExplorer = dynamic(
  () => import("@/components/FileExplorer").then((mod) => mod.FileExplorer),
  { ssr: false, loading: () => <FileExplorerSkeleton /> }
);

const GitPanel = dynamic(
  () => import("@/components/GitPanel").then((mod) => mod.GitPanel),
  { ssr: false, loading: () => <GitPanelSkeleton /> }
);

interface PaneProps {
  paneId: string;
  sessions: Session[];
  projects: Project[];
  onRegisterTerminal: (
    paneId: string,
    tabId: string,
    ref: TerminalHandle | null
  ) => void;
  onMenuClick?: () => void;
  onActivateSessionTab?: (paneId: string, tabId: string) => void;
  onRestoreTab?: (paneId: string, tab: TabData) => void;
  onReloadPage?: () => void;
}

type ViewMode = "terminal" | "files" | "git" | "workers";

export const Pane = memo(function Pane({
  paneId,
  sessions,
  projects,
  onRegisterTerminal,
  onMenuClick,
  onActivateSessionTab,
  onRestoreTab,
  onReloadPage,
}: PaneProps) {
  const { isMobile } = useViewport();
  const {
    hydrated,
    state: paneState,
    focusedPaneId,
    canSplit,
    canClose,
    focusPane,
    splitHorizontal,
    splitVertical,
    close,
    getPaneData,
    getActiveTab,
    addTab,
    closeTab,
    switchTab,
    detachSession,
  } = usePanes();

  const [viewMode, setViewMode] = useState<ViewMode>("terminal");
  const [gitDrawerOpen, setGitDrawerOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("gitDrawerOpen");
    return stored === null ? true : stored === "true";
  });
  const [shellDrawerOpen, setShellDrawerOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("shellDrawerOpen");
    return stored === "true";
  });
  const [selectMode, setSelectMode] = useState(false);
  const terminalRefs = useRef<Map<string, TerminalHandle | null>>(new Map());
  const onRestoreTabRef = useRef(onRestoreTab);
  onRestoreTabRef.current = onRestoreTab;
  const restoredTabsRef = useRef<Set<string>>(new Set());
  const paneData = getPaneData(paneId);
  const activeTab = getActiveTab(paneId);

  // Get ref for active terminal
  const terminalRef = activeTab
    ? (terminalRefs.current.get(activeTab.id) ?? null)
    : null;
  const isFocused = focusedPaneId === paneId;
  const session = activeTab
    ? sessions.find((s) => s.id === activeTab.sessionId)
    : null;

  // Resolve tmux session name for the active tab
  const tmuxSessionName = activeTab
    ? activeTab.sessionId
      ? sessions.find((s) => s.id === activeTab.sessionId)?.tmux_name ||
        activeTab.attachedTmux
      : activeTab.attachedTmux
    : null;

  // File editor state - lifted here so it persists across view switches
  const fileEditor = useFileEditor();

  // Check if this session is a conductor (has workers)
  const workerCount = useMemo(() => {
    if (!session) return 0;
    return sessions.filter((s) => s.conductor_session_id === session.id).length;
  }, [session, sessions]);

  const isConductor = workerCount > 0;

  // Get current project and its repositories
  const currentProject = useMemo(() => {
    if (!session?.project_id) return null;
    return projects.find((p) => p.id === session.project_id) || null;
  }, [session?.project_id, projects]);

  const effectiveWorkingDirectory = useMemo(
    () => getEffectiveWorkingDirectory(session, currentProject),
    [session, currentProject]
  );

  // Type assertion for repositories (projects passed here should have repositories)
  const projectRepositories = useMemo(() => {
    if (!currentProject) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (currentProject as any).repositories || [];
  }, [currentProject]);

  // Watch for file open requests
  const { request: fileOpenRequest } = useSnapshot(fileOpenStore);

  // Reset view mode and file editor when session changes
  useEffect(() => {
    setViewMode("terminal");
    fileEditor.reset();
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist drawer states
  useEffect(() => {
    localStorage.setItem("gitDrawerOpen", String(gitDrawerOpen));
  }, [gitDrawerOpen]);

  useEffect(() => {
    localStorage.setItem("shellDrawerOpen", String(shellDrawerOpen));
  }, [shellDrawerOpen]);

  // Handle file open requests (only if this pane is focused)
  useEffect(() => {
    if (fileOpenRequest && isFocused && session) {
      // Switch to files view
      setViewMode("files");
      // Open the file
      fileEditor.openFile(fileOpenRequest.path);
      // Clear the request
      fileOpenActions.clearRequest();
      // TODO: Scroll to line (requires FileEditor enhancement)
    }
  }, [fileOpenRequest, isFocused, session, fileEditor]);

  const handleFocus = useCallback(() => {
    focusPane(paneId);
  }, [focusPane, paneId]);

  const handleDetach = useCallback(() => {
    if (terminalRef) {
      terminalRef.sendInput("\x02d"); // Ctrl+B d to detach
    }
    detachSession(paneId);
  }, [detachSession, paneId, terminalRef]);

  const handleTabSwitch = useCallback(
    (tabId: string) => {
      switchTab(paneId, tabId);

      const tab = paneData.tabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        onActivateSessionTab?.(paneId, tabId);
      }
    },
    [onActivateSessionTab, paneData.tabs, paneId, switchTab]
  );

  const handleAnyPaneTabSwitch = useCallback(
    (targetPaneId: string, tabId: string) => {
      const targetPane = paneState.panes[targetPaneId];
      if (!targetPane) return;

      focusPane(targetPaneId);
      switchTab(targetPaneId, tabId);

      const tab = targetPane.tabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        onActivateSessionTab?.(targetPaneId, tabId);
      }
    },
    [focusPane, onActivateSessionTab, paneState.panes, switchTab]
  );

  // Create ref callback for a specific tab
  const getTerminalRef = useCallback(
    (tabId: string) => (handle: TerminalHandle | null) => {
      if (handle) {
        terminalRefs.current.set(tabId, handle);
      } else {
        terminalRefs.current.delete(tabId);
      }
    },
    []
  );

  // Create onConnected callback for a specific tab
  const getTerminalConnectedHandler = useCallback(
    (tab: (typeof paneData.tabs)[0]) => () => {
      console.log(
        `[AgentOS] Terminal connected for pane: ${paneId}, tab: ${tab.id}`
      );
      const handle = terminalRefs.current.get(tab.id);
      if (!handle) return;

      onRegisterTerminal(paneId, tab.id, handle);

      if (tab.sessionId) {
        restoredTabsRef.current.add(tab.id);
        onRestoreTabRef.current?.(paneId, tab);
        return;
      }

      // Determine tmux session name to attach
      const tmuxName = tab.attachedTmux;

      if (tmuxName) {
        setTimeout(() => handle.sendCommand(`tmux attach -t ${tmuxName}`), 100);
      }
    },
    [paneId, onRegisterTerminal]
  );

  // After hydration, restore tmux sessions for tabs that connected before tab data was available
  useEffect(() => {
    if (!hydrated) return;

    const timer = setTimeout(() => {
      for (const tab of paneData.tabs) {
        if (!tab.attachedTmux || !tab.sessionId) continue;
        if (restoredTabsRef.current.has(tab.id)) continue;
        const handle = terminalRefs.current.get(tab.id);
        if (handle) {
          restoredTabsRef.current.add(tab.id);
          onRestoreTabRef.current?.(paneId, tab);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Track current tab ID for cleanup
  const activeTabIdRef = useRef<string | null>(null);
  activeTabIdRef.current = activeTab?.id || null;

  // Cleanup on unmount only
  useEffect(() => {
    console.log(
      `[AgentOS] Pane ${paneId} mounted, activeTab: ${activeTab?.id || "null"}`
    );
    return () => {
      console.log(
        `[AgentOS] Pane ${paneId} unmounting, clearing terminal ref for tab: ${activeTabIdRef.current}`
      );
      if (activeTabIdRef.current) {
        onRegisterTerminal(paneId, activeTabIdRef.current, null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId, onRegisterTerminal]);

  // Swipe gesture handling for mobile tab switching (terminal view only)
  const touchStartX = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 120;

  const mobileAllTabs = useMemo<MobileTabListEntry[]>(() => {
    const projectMap = new Map(
      projects.map((project) => [project.id, project])
    );

    return getAllPaneIds(paneState.layout).flatMap((id) => {
      const pane = paneState.panes[id];
      if (!pane) return [];

      return pane.tabs.map((tab) => {
        const tabSession = tab.sessionId
          ? sessions.find((candidate) => candidate.id === tab.sessionId) || null
          : null;
        const projectId = tabSession?.project_id || "uncategorized";
        const projectLabel = projectMap.get(projectId)?.name || "Uncategorized";

        return {
          paneId: id,
          tab,
          projectId,
          projectLabel,
        };
      });
    });
  }, [paneState.layout, paneState.panes, projects, sessions]);

  const activeMobileTabIndex = useMemo(
    () =>
      mobileAllTabs.findIndex(
        (entry) =>
          entry.paneId === paneId && entry.tab.id === paneData.activeTabId
      ),
    [mobileAllTabs, paneData.activeTabId, paneId]
  );

  const mobileProjectGroups = useMemo<MobileProjectGroup[]>(() => {
    const groupedEntries = new Map<string, MobileProjectGroup>();

    for (const entry of mobileAllTabs) {
      const existingGroup = groupedEntries.get(entry.projectId);
      if (existingGroup) {
        existingGroup.entries.push(entry);
        continue;
      }

      groupedEntries.set(entry.projectId, {
        projectId: entry.projectId,
        projectLabel: entry.projectLabel,
        entries: [entry],
      });
    }

    const knownProjectIds = new Set(groupedEntries.keys());
    const orderedGroups = projects
      .filter((project) => knownProjectIds.has(project.id))
      .map((project) => groupedEntries.get(project.id))
      .filter((group): group is MobileProjectGroup => group !== undefined);

    const remainingGroups = Array.from(groupedEntries.values()).filter(
      (group) => !projects.some((project) => project.id === group.projectId)
    );

    return [...orderedGroups, ...remainingGroups];
  }, [mobileAllTabs, projects]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (viewMode !== "terminal") return;
      touchStartX.current = e.touches[0].clientX;
    },
    [viewMode]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (viewMode !== "terminal" || touchStartX.current === null) return;

      const diff = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;

      if (Math.abs(diff) <= SWIPE_THRESHOLD) return;

      const nextIndex =
        diff > 0 ? activeMobileTabIndex - 1 : activeMobileTabIndex + 1;
      const nextEntry = mobileAllTabs[nextIndex];
      if (nextEntry) {
        handleAnyPaneTabSwitch(nextEntry.paneId, nextEntry.tab.id);
      }
    },
    [viewMode, activeMobileTabIndex, mobileAllTabs, handleAnyPaneTabSwitch]
  );

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden",
        !isMobile && "rounded-lg shadow-lg shadow-black/10 dark:shadow-black/30"
      )}
      onClick={handleFocus}
    >
      {/* Tab Bar - Mobile vs Desktop */}
      {isMobile ? (
        <MobileTabBar
          paneId={paneId}
          tabs={paneData.tabs}
          activeTabId={paneData.activeTabId}
          allTabs={mobileAllTabs}
          projectGroups={mobileProjectGroups}
          session={session}
          sessions={sessions}
          projects={projects}
          viewMode={viewMode}
          isConductor={isConductor}
          workerCount={workerCount}
          onMenuClick={onMenuClick}
          onViewModeChange={setViewMode}
          onTabSwitch={handleAnyPaneTabSwitch}
          onTabClose={(tabId) => closeTab(paneId, tabId)}
          onReloadPage={onReloadPage || (() => window.location.reload())}
        />
      ) : (
        <DesktopTabBar
          tabs={paneData.tabs}
          activeTabId={paneData.activeTabId}
          session={session}
          sessions={sessions}
          viewMode={viewMode}
          isFocused={isFocused}
          isConductor={isConductor}
          workerCount={workerCount}
          canSplit={canSplit}
          canClose={canClose}
          hasAttachedTmux={!!activeTab?.attachedTmux}
          gitDrawerOpen={gitDrawerOpen}
          shellDrawerOpen={shellDrawerOpen}
          onTabSwitch={handleTabSwitch}
          onTabClose={(tabId) => closeTab(paneId, tabId)}
          onTabAdd={() => addTab(paneId)}
          onViewModeChange={setViewMode}
          onGitDrawerToggle={() => setGitDrawerOpen((prev) => !prev)}
          onShellDrawerToggle={() => setShellDrawerOpen((prev) => !prev)}
          onSplitHorizontal={() => splitHorizontal(paneId)}
          onSplitVertical={() => splitVertical(paneId)}
          onClose={() => close(paneId)}
          onDetach={handleDetach}
          selectMode={selectMode}
          onSelectModeToggle={() => setSelectMode((prev) => !prev)}
        />
      )}

      {/* Content Area - Mobile: simple flex, Desktop: resizable panels */}
      {isMobile ? (
        <div
          className="relative min-h-0 w-full flex-1"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Terminals - one per tab */}
          {paneData.tabs.map((tab) => {
            const isActive = tab.id === activeTab?.id;
            const savedState = sessionRegistry.getTerminalState(paneId, tab.id);
            const tabTmuxName = tab.sessionId
              ? sessions.find((s) => s.id === tab.sessionId)?.tmux_name ||
                tab.attachedTmux
              : tab.attachedTmux;

            return (
              <div
                key={tab.id}
                className={
                  viewMode === "terminal" && isActive
                    ? "h-full w-full"
                    : "hidden"
                }
              >
                <Terminal
                  ref={getTerminalRef(tab.id)}
                  onConnected={getTerminalConnectedHandler(tab)}
                  onBeforeUnmount={(scrollState) => {
                    sessionRegistry.saveTerminalState(paneId, tab.id, {
                      scrollTop: scrollState.scrollTop,
                      scrollHeight: 0,
                      lastActivity: Date.now(),
                      cursorY: scrollState.cursorY,
                    });
                  }}
                  initialScrollState={
                    savedState
                      ? {
                          scrollTop: savedState.scrollTop,
                          cursorY: savedState.cursorY,
                          baseY: 0,
                        }
                      : undefined
                  }
                  tmuxSessionName={tabTmuxName || undefined}
                  onReloadPage={onReloadPage}
                />
              </div>
            );
          })}

          {/* Files */}
          {effectiveWorkingDirectory && (
            <div className={viewMode === "files" ? "h-full" : "hidden"}>
              <FileExplorer
                workingDirectory={effectiveWorkingDirectory}
                fileEditor={fileEditor}
              />
            </div>
          )}

          {/* Git - mobile only */}
          {effectiveWorkingDirectory && (
            <div className={viewMode === "git" ? "h-full" : "hidden"}>
              <GitPanel
                workingDirectory={effectiveWorkingDirectory}
                projectId={currentProject?.id}
                repositories={projectRepositories}
              />
            </div>
          )}

          {/* Workers */}
          {viewMode === "workers" && session && (
            <ConductorPanel
              conductorSessionId={session.id}
              onAttachToWorker={(workerId) => {
                setViewMode("terminal");
                const worker = sessions.find((s) => s.id === workerId);
                if (worker && terminalRef) {
                  const sessionName = `claude-${workerId}`;
                  terminalRef.sendInput("\x02d");
                  setTimeout(() => {
                    terminalRef?.sendInput("\x15");
                    setTimeout(() => {
                      terminalRef?.sendCommand(`tmux attach -t ${sessionName}`);
                    }, 50);
                  }, 100);
                }
              }}
            />
          )}
        </div>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          {/* Left column: Main content + Shell drawer */}
          <ResizablePanel defaultSize={gitDrawerOpen ? 70 : 100} minSize={20}>
            <ResizablePanelGroup orientation="vertical" className="h-full">
              {/* Main content */}
              <ResizablePanel
                defaultSize={shellDrawerOpen ? 70 : 100}
                minSize={10}
              >
                <div className="relative h-full">
                  {/* Terminals - one per tab */}
                  {paneData.tabs.map((tab) => {
                    const isActive = tab.id === activeTab?.id;
                    const savedState = sessionRegistry.getTerminalState(
                      paneId,
                      tab.id
                    );
                    const tabTmuxName = tab.sessionId
                      ? sessions.find((s) => s.id === tab.sessionId)
                          ?.tmux_name || tab.attachedTmux
                      : tab.attachedTmux;

                    return (
                      <div
                        key={tab.id}
                        className={
                          viewMode === "terminal" && isActive
                            ? "h-full"
                            : "hidden"
                        }
                      >
                        <Terminal
                          ref={getTerminalRef(tab.id)}
                          onConnected={getTerminalConnectedHandler(tab)}
                          onBeforeUnmount={(scrollState) => {
                            sessionRegistry.saveTerminalState(paneId, tab.id, {
                              scrollTop: scrollState.scrollTop,
                              scrollHeight: 0,
                              lastActivity: Date.now(),
                              cursorY: scrollState.cursorY,
                            });
                          }}
                          initialScrollState={
                            savedState
                              ? {
                                  scrollTop: savedState.scrollTop,
                                  cursorY: savedState.cursorY,
                                  baseY: 0,
                                }
                              : undefined
                          }
                          tmuxSessionName={tabTmuxName || undefined}
                          selectMode={selectMode}
                          onSelectModeChange={setSelectMode}
                          onReloadPage={onReloadPage}
                        />
                      </div>
                    );
                  })}

                  {/* Files */}
                  {effectiveWorkingDirectory && (
                    <div className={viewMode === "files" ? "h-full" : "hidden"}>
                      <FileExplorer
                        workingDirectory={effectiveWorkingDirectory}
                        fileEditor={fileEditor}
                      />
                    </div>
                  )}

                  {/* Workers */}
                  {viewMode === "workers" && session && (
                    <ConductorPanel
                      conductorSessionId={session.id}
                      onAttachToWorker={(workerId) => {
                        setViewMode("terminal");
                        const worker = sessions.find((s) => s.id === workerId);
                        if (worker && terminalRef) {
                          const sessionName = `claude-${workerId}`;
                          terminalRef.sendInput("\x02d");
                          setTimeout(() => {
                            terminalRef?.sendInput("\x15");
                            setTimeout(() => {
                              terminalRef?.sendCommand(
                                `tmux attach -t ${sessionName}`
                              );
                            }, 50);
                          }, 100);
                        }
                      }}
                    />
                  )}
                </div>
              </ResizablePanel>

              {/* Shell drawer - under main content */}
              {shellDrawerOpen && effectiveWorkingDirectory && (
                <>
                  <ResizablePanelHandle className="bg-border/30 hover:bg-primary/30 active:bg-primary/50 h-px cursor-row-resize transition-colors" />
                  <ResizablePanel defaultSize={30} minSize={10}>
                    <ShellDrawer
                      open={true}
                      onOpenChange={setShellDrawerOpen}
                      workingDirectory={effectiveWorkingDirectory}
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>

          {/* Git drawer - right side, full height */}
          {gitDrawerOpen && effectiveWorkingDirectory && (
            <>
              <ResizablePanelHandle className="bg-border/30 hover:bg-primary/30 active:bg-primary/50 w-px cursor-col-resize transition-colors" />
              <ResizablePanel defaultSize={30} minSize={10}>
                <GitDrawer
                  open={true}
                  onOpenChange={setGitDrawerOpen}
                  workingDirectory={effectiveWorkingDirectory}
                  projectId={currentProject?.id}
                  repositories={projectRepositories}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
    </div>
  );
});
