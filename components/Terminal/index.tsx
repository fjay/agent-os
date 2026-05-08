"use client";

import {
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useState,
  useMemo,
  useEffect,
} from "react";
import { useTheme } from "next-themes";
import "@xterm/xterm/css/xterm.css";
import { Paperclip, WifiOff, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchBar } from "./SearchBar";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { TerminalToolbar } from "./TerminalToolbar";
import { useTerminalConnection, useTerminalSearch } from "./hooks";
import type { TerminalScrollState } from "./hooks";
import { useViewport } from "@/hooks/useViewport";
import { useFileDrop } from "@/hooks/useFileDrop";
import { uploadFileToTemp } from "@/lib/file-upload";
import { FilePicker } from "@/components/FilePicker";

export type { TerminalScrollState };

export interface TerminalHandle {
  sendCommand: (command: string) => void;
  sendInput: (data: string) => void;
  focus: () => void;
  getScrollState: () => TerminalScrollState | null;
  restoreScrollState: (state: TerminalScrollState) => void;
  toggleSelectMode: () => void;
}

interface TerminalProps {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onBeforeUnmount?: (scrollState: TerminalScrollState) => void;
  initialScrollState?: TerminalScrollState;
  /** Show image picker button (default: true) */
  showImageButton?: boolean;
  /** Tmux session name for capturing history */
  tmuxSessionName?: string;
  /** External select mode control (for desktop toolbar) */
  selectMode?: boolean;
  /** Callback when select mode changes */
  onSelectModeChange?: (enabled: boolean) => void;
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
  function Terminal(
    {
      onConnected,
      onDisconnected,
      onBeforeUnmount,
      initialScrollState,
      showImageButton = true,
      tmuxSessionName,
      selectMode: externalSelectMode,
      onSelectModeChange,
    },
    ref
  ) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectTextRef = useRef<HTMLPreElement>(null);
    const { isMobile } = useViewport();
    const { theme: currentTheme, resolvedTheme } = useTheme();
    const [showFilePicker, setShowFilePicker] = useState(false);
    const [internalSelectMode, setInternalSelectMode] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [tmuxText, setTmuxText] = useState<string | null>(null);
    const [tmuxLoading, setTmuxLoading] = useState(false);

    const selectModeActive =
      externalSelectMode !== undefined
        ? externalSelectMode
        : internalSelectMode;
    const handleSelectModeChange = useCallback(
      (enabled: boolean) => {
        if (onSelectModeChange) {
          onSelectModeChange(enabled);
        } else {
          setInternalSelectMode(enabled);
        }
      },
      [onSelectModeChange]
    );

    // Use the full theme string (e.g., "dark-purple") for terminal theming
    const terminalTheme = useMemo(() => {
      // For system theme, use the resolved theme
      if (currentTheme === "system") {
        return resolvedTheme || "dark";
      }
      return currentTheme || "dark";
    }, [currentTheme, resolvedTheme]);

    const {
      connectionState,
      isAtBottom,
      xtermRef,
      searchAddonRef,
      scrollToBottom,
      copySelection,
      sendInput,
      sendCommand,
      focus,
      getScrollState,
      restoreScrollState,
      reconnect,
    } = useTerminalConnection({
      terminalRef,
      onConnected,
      onDisconnected,
      onBeforeUnmount,
      initialScrollState,
      isMobile,
      theme: terminalTheme,
      selectMode: selectModeActive,
    });

    const {
      searchVisible,
      searchQuery,
      setSearchQuery,
      searchInputRef,
      closeSearch,
      findNext,
      findPrevious,
    } = useTerminalSearch(searchAddonRef, xtermRef);

    // Handle image selection - paste file path into terminal
    const handleImageSelect = useCallback(
      (filePath: string) => {
        sendInput(filePath);
        setShowFilePicker(false);
        focus();
      },
      [sendInput, focus]
    );

    // Handle file drop - upload and insert path into terminal
    const handleFileDrop = useCallback(
      async (file: File) => {
        setIsUploading(true);
        try {
          const path = await uploadFileToTemp(file);
          if (path) {
            sendInput(path);
            focus();
          }
        } catch (err) {
          console.error("Failed to upload file:", err);
        } finally {
          setIsUploading(false);
        }
      },
      [sendInput, focus]
    );

    // Drag and drop for file uploads
    const { isDragging, dragHandlers } = useFileDrop(
      containerRef,
      handleFileDrop,
      { disabled: isUploading || showFilePicker }
    );

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
      sendCommand,
      sendInput,
      focus,
      getScrollState,
      restoreScrollState,
      toggleSelectMode: () => handleSelectModeChange(!selectModeActive),
    }));

    // Extract terminal text for select mode overlay
    const terminalText = useMemo(() => {
      if (!selectModeActive || !xtermRef.current) return "";

      const term = xtermRef.current;
      const buffer = term.buffer.active;
      const endRow = buffer.baseY + term.rows;
      const lines: string[] = [];

      for (let i = 0; i < endRow; i++) {
        const line = buffer.getLine(i);
        if (line) lines.push(line.translateToString(true));
      }

      return lines.join("\n");
    }, [selectModeActive, xtermRef]);

    // Display tmux captured text if available, otherwise xterm buffer
    const displayText = tmuxText ?? terminalText;

    // Load tmux history via capture-pane
    const loadTmuxHistory = useCallback(async () => {
      if (!tmuxSessionName || tmuxLoading) return;
      setTmuxLoading(true);
      try {
        const res = await fetch("/api/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: `tmux capture-pane -t ${tmuxSessionName} -p -S -`,
          }),
        });
        const data = await res.json();
        if (data.success && data.output) {
          setTmuxText(data.output.trimEnd());
        }
      } catch (e) {
        console.error("Failed to capture tmux history:", e);
      } finally {
        setTmuxLoading(false);
      }
    }, [tmuxSessionName, tmuxLoading]);

    // Copy from overlay using browser selection
    const handleOverlayCopy = useCallback(() => {
      const selection = window.getSelection()?.toString();
      if (selection) {
        navigator.clipboard.writeText(selection);
        return true;
      }
      return false;
    }, []);

    // Reset tmux text when exiting select mode; auto-load when entering
    useEffect(() => {
      if (!selectModeActive) {
        setTmuxText(null);
      } else if (tmuxSessionName && !tmuxText && !tmuxLoading) {
        loadTmuxHistory();
      }
    }, [selectModeActive]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (!selectModeActive) return;

      requestAnimationFrame(() => {
        const selectText = selectTextRef.current;
        if (selectText) {
          selectText.scrollTop = selectText.scrollHeight;
        }
      });
    }, [selectModeActive, displayText]);

    // Desktop keyboard shortcut: Ctrl+Shift+S to toggle select mode
    useEffect(() => {
      if (isMobile) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) {
          e.preventDefault();
          handleSelectModeChange(!selectModeActive);
        }
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isMobile, selectModeActive, handleSelectModeChange]);

    return (
      <div
        ref={containerRef}
        className="bg-background flex flex-col overflow-hidden"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
        {...dragHandlers}
      >
        {/* Search Bar */}
        <SearchBar
          ref={searchInputRef}
          visible={searchVisible}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onFindNext={findNext}
          onFindPrevious={findPrevious}
          onClose={closeSearch}
        />

        {/* Terminal container - NO padding! FitAddon reads offsetHeight which includes padding */}
        <div
          ref={terminalRef}
          className={cn(
            "terminal-container min-h-0 w-full flex-1 overflow-hidden",
            selectModeActive && "ring-primary ring-2 ring-inset",
            isDragging && "ring-primary ring-2 ring-inset"
          )}
          onClick={focus}
          onTouchStart={
            selectModeActive ? (e) => e.stopPropagation() : undefined
          }
          onTouchEnd={selectModeActive ? (e) => e.stopPropagation() : undefined}
        />

        {/* Select mode overlay - shows terminal text in a selectable format */}
        {selectModeActive && (
          <div
            className="bg-background absolute inset-0 z-40 flex flex-col"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <div className="bg-primary text-primary-foreground flex items-center justify-end px-3 py-2 text-xs font-medium">
              <button
                onClick={() => handleSelectModeChange(false)}
                className="bg-primary-foreground/20 rounded px-2 py-0.5 text-xs"
              >
                Done
              </button>
            </div>
            <pre
              ref={selectTextRef}
              className="flex-1 overflow-auto p-3 font-mono text-xs break-all whitespace-pre-wrap select-text"
              style={{
                userSelect: "text",
                WebkitUserSelect: "text",
              }}
            >
              {displayText}
            </pre>
          </div>
        )}

        {/* Drag and drop overlay */}
        {isDragging && (
          <div className="bg-primary/10 pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div className="border-primary bg-background/90 rounded-lg border px-6 py-4 text-center shadow-lg">
              <Upload className="text-primary mx-auto mb-2 h-8 w-8" />
              <p className="text-sm font-medium">Drop file to upload</p>
            </div>
          </div>
        )}

        {/* Upload in progress overlay */}
        {isUploading && (
          <div className="bg-background/50 pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div className="bg-background rounded-lg border px-6 py-4 text-center shadow-lg">
              <Loader2 className="text-primary mx-auto mb-2 h-6 w-6 animate-spin" />
              <p className="text-sm">Uploading file...</p>
            </div>
          </div>
        )}

        {/* File picker button - desktop only, for agent terminals */}
        {!isMobile && showImageButton && (
          <button
            onClick={() => setShowFilePicker(true)}
            className="bg-secondary hover:bg-accent absolute top-3 right-3 z-40 flex h-9 w-9 items-center justify-center rounded-full shadow-lg transition-all"
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        )}

        {/* Image picker modal */}
        {showFilePicker && (
          <FilePicker
            initialPath="~"
            onSelect={handleImageSelect}
            onClose={() => setShowFilePicker(false)}
          />
        )}

        {/* Scroll to bottom button */}
        <ScrollToBottomButton visible={!isAtBottom} onClick={scrollToBottom} />

        {/* Mobile: Toolbar with special keys (native keyboard handles text) */}
        {isMobile && (
          <TerminalToolbar
            onKeyPress={sendInput}
            onFilePicker={() => setShowFilePicker(true)}
            selectMode={selectModeActive}
            onSelectModeChange={handleSelectModeChange}
            visible={true}
          />
        )}

        {/* Connection status overlays */}
        {connectionState === "connecting" && (
          <div className="bg-background absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <div className="bg-primary h-2 w-2 animate-pulse rounded-full" />
            <span className="text-muted-foreground text-sm">Connecting...</span>
          </div>
        )}

        {connectionState === "reconnecting" && (
          <div className="absolute top-4 left-4 flex items-center gap-2 rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-400">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Reconnecting...
          </div>
        )}

        {/* Disconnected overlay - shows tap to reconnect button */}
        {connectionState === "disconnected" && (
          <button
            onClick={reconnect}
            className="bg-background/80 active:bg-background/90 absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 backdrop-blur-sm transition-all"
          >
            <WifiOff className="text-muted-foreground h-8 w-8" />
            <span className="text-foreground text-sm font-medium">
              Connection lost
            </span>
            <span className="bg-primary text-primary-foreground rounded-full px-4 py-2 text-sm font-medium">
              Tap to reconnect
            </span>
          </button>
        )}
      </div>
    );
  }
);
