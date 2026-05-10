"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Debug log buffer - persists even if console is closed
const debugLogs: string[] = [];
const MAX_DEBUG_LOGS = 100;

function debugLog(message: string) {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
  const entry = `[${timestamp}] ${message}`;
  debugLogs.push(entry);
  if (debugLogs.length > MAX_DEBUG_LOGS) debugLogs.shift();
  console.log(`[AgentOS] ${message}`);
}

// Expose to window for debugging
if (typeof window !== "undefined") {
  (window as unknown as { agentOSLogs: () => void }).agentOSLogs = () => {
    console.log("=== AgentOS Debug Logs ===");
    debugLogs.forEach((log) => console.log(log));
    console.log("=== End Logs ===");
  };
}
import { PaneProvider, usePanes } from "@/contexts/PaneContext";
import { Pane } from "@/components/Pane";
import { useNotifications } from "@/hooks/useNotifications";
import { useViewport } from "@/hooks/useViewport";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { useSessions } from "@/hooks/useSessions";
import { useProjects } from "@/hooks/useProjects";
import { useDevServersManager } from "@/hooks/useDevServersManager";
import { useSessionStatuses } from "@/hooks/useSessionStatuses";
import type { Session } from "@/lib/db";
import type { TabData } from "@/lib/panes";
import type { TerminalHandle } from "@/components/Terminal";
import { getProvider } from "@/lib/providers";
import { getEffectiveWorkingDirectory } from "@/lib/session-path";
import { DesktopView } from "@/components/views/DesktopView";
import { MobileView } from "@/components/views/MobileView";
import { getPendingPrompt, clearPendingPrompt } from "@/stores/initialPrompt";

function HomeContent() {
  // UI State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [newSessionProjectId, setNewSessionProjectId] = useState<string | null>(
    null
  );
  const [showNotificationSettings, setShowNotificationSettings] =
    useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const terminalRefs = useRef<Map<string, TerminalHandle>>(new Map());

  // Pane context
  const {
    focusedPaneId,
    focusPane,
    switchTab,
    attachSession,
    getActiveTab,
    addTab,
    findOpenTabBySessionId,
  } = usePanes();
  const focusedActiveTab = getActiveTab(focusedPaneId);
  const { isMobile } = useViewport();

  // Data hooks
  const { sessions, fetchSessions } = useSessions();
  const { projects, fetchProjects } = useProjects();
  const {
    startDevServerProjectId,
    setStartDevServerProjectId,
    startDevServer,
    createDevServer,
  } = useDevServersManager();

  // Helper to get init script command from API
  const getInitScriptCommand = useCallback(
    async (agentCommand: string): Promise<string> => {
      try {
        const res = await fetch("/api/sessions/init-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentCommand }),
        });
        const data = await res.json();
        return data.command || agentCommand;
      } catch {
        return agentCommand;
      }
    },
    []
  );

  // Set CSS variable for viewport height (handles mobile keyboard)
  useViewportHeight();

  // Terminal ref management
  const registerTerminalRef = useCallback(
    (paneId: string, tabId: string, ref: TerminalHandle | null) => {
      const key = `${paneId}:${tabId}`;
      if (ref) {
        terminalRefs.current.set(key, ref);
        debugLog(
          `Terminal registered: ${key}, total refs: ${terminalRefs.current.size}`
        );
      } else {
        terminalRefs.current.delete(key);
        debugLog(
          `Terminal unregistered: ${key}, total refs: ${terminalRefs.current.size}`
        );
      }
    },
    []
  );

  // Build tmux command for a session
  const buildSessionCommand = useCallback(
    async (
      session: Session
    ): Promise<{ sessionName: string; cwd: string; command: string }> => {
      const provider = getProvider(session.agent_type || "claude");
      const sessionName = session.tmux_name || `${provider.id}-${session.id}`;
      const project = session.project_id
        ? projects.find((item) => item.id === session.project_id)
        : null;
      const cwd =
        getEffectiveWorkingDirectory(session, project)?.replace("~", "$HOME") ||
        "$HOME";

      // Shell sessions just open a terminal - no agent command
      if (provider.id === "shell") {
        return { sessionName, cwd, command: "" };
      }

      // TODO: Add explicit "Enable Orchestration" toggle that creates .mcp.json
      // for conductor sessions. Removed auto-creation because it pollutes projects
      // with .mcp.json files that aren't in their .gitignore.
      // See: /api/sessions/[id]/mcp-config, lib/mcp-config.ts

      // Get parent session ID for forking
      let parentSessionId: string | null = null;
      if (!session.claude_session_id && session.parent_session_id) {
        const parentSession = sessions.find(
          (s) => s.id === session.parent_session_id
        );
        parentSessionId = parentSession?.claude_session_id || null;
      }

      // Check for pending initial prompt
      const initialPrompt = getPendingPrompt(session.id);
      if (initialPrompt) {
        clearPendingPrompt(session.id);
      }

      const flags = provider.buildFlags({
        sessionId: session.claude_session_id,
        parentSessionId,
        autoApprove: session.auto_approve,
        model: session.model,
        initialPrompt: initialPrompt || undefined,
      });
      const flagsStr = flags.join(" ");

      const agentCmd = `${provider.command} ${flagsStr}`;
      const command = await getInitScriptCommand(agentCmd);

      return { sessionName, cwd, command };
    },
    [sessions, projects, getInitScriptCommand]
  );

  // Attach a session to a terminal
  const buildTmuxAttachOrCreateCommand = useCallback(
    (sessionInfo: { sessionName: string; cwd: string; command: string }) => {
      const { sessionName, cwd, command } = sessionInfo;
      const tmuxNew = command
        ? `tmux new -s ${sessionName} -c "${cwd}" "${command}"`
        : `tmux new -s ${sessionName} -c "${cwd}"`;
      return `tmux set -g mouse on 2>/dev/null; tmux attach -t ${sessionName} 2>/dev/null || ${tmuxNew}`;
    },
    []
  );

  const runSessionInTerminal = useCallback(
    (
      terminal: TerminalHandle,
      paneId: string,
      session: Session,
      sessionInfo: { sessionName: string; cwd: string; command: string }
    ) => {
      const { sessionName } = sessionInfo;
      terminal.sendCommand(buildTmuxAttachOrCreateCommand(sessionInfo));
      attachSession(paneId, session.id, sessionName);
      terminal.focus();
    },
    [attachSession, buildTmuxAttachOrCreateCommand]
  );

  const activateOpenSessionTab = useCallback(
    (paneId: string, tabId: string) => {
      focusPane(paneId);
      switchTab(paneId, tabId);

      const terminal = terminalRefs.current.get(`${paneId}:${tabId}`);
      if (!terminal) return;

      const connectionState = terminal.getConnectionState();
      if (connectionState === "disconnected") {
        terminal.reconnect();
      }
      terminal.focus();
    },
    [focusPane, switchTab]
  );

  const ensureSessionOpen = useCallback(
    async (session: Session) => {
      const openTab = findOpenTabBySessionId(session.id);
      if (openTab) {
        activateOpenSessionTab(openTab.paneId, openTab.tabId);
        return;
      }

      const paneId = focusedPaneId;
      const newTabId = addTab(paneId);
      focusPane(paneId);
      switchTab(paneId, newTabId);

      let attempts = 0;
      const maxAttempts = 20;

      const waitForNewTerminal = () => {
        attempts++;
        const terminal = terminalRefs.current.get(`${paneId}:${newTabId}`);
        if (terminal) {
          buildSessionCommand(session).then((sessionInfo) => {
            runSessionInTerminal(terminal, paneId, session, sessionInfo);
          });
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(waitForNewTerminal, 50);
        } else {
          debugLog(`Failed to find new terminal after ${maxAttempts} attempts`);
        }
      };

      setTimeout(waitForNewTerminal, 50);
    },
    [
      activateOpenSessionTab,
      addTab,
      buildSessionCommand,
      focusedPaneId,
      findOpenTabBySessionId,
      focusPane,
      runSessionInTerminal,
      switchTab,
    ]
  );

  // Attach session to terminal, reusing an existing tab when available.
  const attachToSession = useCallback(
    async (session: Session) => {
      await ensureSessionOpen(session);
    },
    [ensureSessionOpen]
  );

  // Restore a tab's tmux session after restart (same logic as sidebar click)
  const handleTabRestore = useCallback(
    async (paneId: string, tab: TabData) => {
      if (!tab.sessionId) return;

      let session = sessions.find((s) => s.id === tab.sessionId);
      if (!session) {
        try {
          const res = await fetch(`/api/sessions/${tab.sessionId}`);
          const data = await res.json();
          session = data.session;
        } catch {
          return;
        }
      }
      if (!session) return;

      const key = `${paneId}:${tab.id}`;
      const terminal = terminalRefs.current.get(key);
      if (!terminal) return;

      buildSessionCommand(session).then((sessionInfo) => {
        terminal.sendCommand(buildTmuxAttachOrCreateCommand(sessionInfo));
      });
    },
    [sessions, buildSessionCommand, buildTmuxAttachOrCreateCommand]
  );

  // Open session in new tab
  const openSessionInNewTab = useCallback(
    (session: Session) => {
      const paneId = focusedPaneId;
      const newTabId = addTab(paneId);
      focusPane(paneId);
      switchTab(paneId, newTabId);

      let attempts = 0;
      const maxAttempts = 20;

      const waitForNewTerminal = () => {
        attempts++;

        const key = `${paneId}:${newTabId}`;
        const terminal = terminalRefs.current.get(key);
        if (terminal) {
          buildSessionCommand(session).then((sessionInfo) => {
            runSessionInTerminal(terminal, paneId, session, sessionInfo);
          });
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(waitForNewTerminal, 50);
        } else {
          debugLog(`Failed to find new terminal after ${maxAttempts} attempts`);
        }
      };

      setTimeout(waitForNewTerminal, 50);
    },
    [
      addTab,
      buildSessionCommand,
      focusPane,
      focusedPaneId,
      runSessionInTerminal,
      switchTab,
    ]
  );

  // Notification click handler
  const handleNotificationClick = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        attachToSession(session);
      }
    },
    [sessions, attachToSession]
  );

  // Notifications
  const {
    settings: notificationSettings,
    checkStateChanges,
    updateSettings,
    requestPermission,
    permissionGranted,
  } = useNotifications({ onSessionClick: handleNotificationClick });

  // Session statuses
  const { sessionStatuses } = useSessionStatuses({
    sessions,
    activeSessionId: focusedActiveTab?.sessionId,
    checkStateChanges,
  });

  // Keyboard shortcut: Cmd+K to open quick switcher
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowQuickSwitcher(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleReloadPage = useCallback(() => {
    window.location.reload();
  }, []);

  // Pane renderer
  const renderPane = useCallback(
    (paneId: string) => (
      <Pane
        key={paneId}
        paneId={paneId}
        sessions={sessions}
        projects={projects}
        onRegisterTerminal={registerTerminalRef}
        onMenuClick={isMobile ? () => setSidebarOpen(true) : undefined}
        onActivateSessionTab={activateOpenSessionTab}
        onRestoreTab={handleTabRestore}
        onReloadPage={handleReloadPage}
      />
    ),
    [
      sessions,
      projects,
      registerTerminalRef,
      isMobile,
      activateOpenSessionTab,
      handleTabRestore,
      handleReloadPage,
    ]
  );

  // New session in project handler
  const handleNewSessionInProject = useCallback((projectId: string) => {
    setNewSessionProjectId(projectId);
    setShowNewSessionDialog(true);
  }, []);

  // Session created handler (shared between desktop/mobile)
  const handleSessionCreated = useCallback(
    async (sessionId: string) => {
      setShowNewSessionDialog(false);
      setNewSessionProjectId(null);
      await fetchSessions();

      const res = await fetch(`/api/sessions/${sessionId}`);
      const data = await res.json();
      if (!data.session) return;

      setTimeout(() => attachToSession(data.session), 100);
    },
    [fetchSessions, attachToSession]
  );

  // Project created handler (shared between desktop/mobile)
  const handleCreateProject = useCallback(
    async (
      name: string,
      workingDirectory: string,
      agentType?: string
    ): Promise<string | null> => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, workingDirectory, agentType }),
      });
      const data = await res.json();
      if (data.project) {
        await fetchProjects();
        return data.project.id;
      }
      return null;
    },
    [fetchProjects]
  );

  // Open terminal in project handler (shell session, not AI agent)
  const handleOpenTerminal = useCallback(
    async (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;

      // Create a shell session with the project's working directory
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${project.name} Terminal`,
          workingDirectory: project.working_directory || "~",
          agentType: "shell",
          projectId,
        }),
      });

      const data = await res.json();
      if (!data.session) return;

      await fetchSessions();

      // Small delay to ensure state updates, then attach
      setTimeout(() => {
        attachToSession(data.session);
      }, 100);
    },
    [projects, fetchSessions, attachToSession]
  );

  // Active session and dev server project
  const activeSession = sessions.find(
    (s) => s.id === focusedActiveTab?.sessionId
  );
  const startDevServerProject = startDevServerProjectId
    ? (projects.find((p) => p.id === startDevServerProjectId) ?? null)
    : null;

  // View props
  const viewProps = {
    sessions,
    projects,
    sessionStatuses,
    sidebarOpen,
    setSidebarOpen,
    activeSession,
    focusedActiveTab,
    copiedSessionId,
    setCopiedSessionId,
    showNewSessionDialog,
    setShowNewSessionDialog,
    newSessionProjectId,
    showNotificationSettings,
    setShowNotificationSettings,
    showQuickSwitcher,
    setShowQuickSwitcher,
    onReloadPage: handleReloadPage,
    notificationSettings,
    permissionGranted,
    updateSettings,
    requestPermission,
    attachToSession,
    openSessionInNewTab,
    handleNewSessionInProject,
    handleOpenTerminal,
    handleSessionCreated,
    handleCreateProject,
    handleStartDevServer: startDevServer,
    handleCreateDevServer: createDevServer,
    startDevServerProject,
    setStartDevServerProjectId,
    renderPane,
  };

  if (isMobile) {
    return <MobileView {...viewProps} />;
  }

  return <DesktopView {...viewProps} />;
}

export default function Home() {
  return (
    <PaneProvider>
      <HomeContent />
    </PaneProvider>
  );
}
