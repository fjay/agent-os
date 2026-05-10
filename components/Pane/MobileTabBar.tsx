"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Menu,
  ChevronLeft,
  ChevronRight,
  Terminal as TerminalIcon,
  FolderOpen,
  GitBranch,
  Users,
  ChevronDown,
  Circle,
  X,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Session, Project } from "@/lib/db";
import type { TabData } from "@/lib/panes";
import type { LucideIcon } from "lucide-react";

type ViewMode = "terminal" | "files" | "git" | "workers";

export interface MobileTabListEntry {
  paneId: string;
  tab: TabData;
  projectId: string;
  projectLabel: string;
}

export interface MobileProjectGroup {
  projectId: string;
  projectLabel: string;
  entries: MobileTabListEntry[];
}

interface ViewModeButtonProps {
  mode: ViewMode;
  currentMode: ViewMode;
  icon: LucideIcon;
  onClick: (mode: ViewMode) => void;
  badge?: React.ReactNode;
}

function ViewModeButton({
  mode,
  currentMode,
  icon: Icon,
  onClick,
  badge,
}: ViewModeButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(mode);
      }}
      className={cn(
        "rounded p-1.5 transition-colors",
        badge && "flex items-center gap-0.5",
        currentMode === mode
          ? "bg-secondary text-foreground"
          : "text-muted-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {badge}
    </button>
  );
}

interface MobileTabBarProps {
  paneId: string;
  tabs: TabData[];
  activeTabId: string;
  allTabs: MobileTabListEntry[];
  projectGroups: MobileProjectGroup[];
  session: Session | null | undefined;
  sessions: Session[];
  projects: Project[];
  viewMode: ViewMode;
  isConductor: boolean;
  workerCount: number;
  onMenuClick?: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onTabSwitch: (paneId: string, tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onReloadPage: () => void;
}

export function MobileTabBar({
  paneId,
  tabs,
  activeTabId,
  allTabs,
  projectGroups,
  session,
  sessions,
  projects,
  viewMode,
  isConductor,
  workerCount,
  onMenuClick,
  onViewModeChange,
  onTabSwitch,
  onTabClose,
  onReloadPage,
}: MobileTabBarProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || null;
  const activeEntry =
    allTabs.find(
      (entry) => entry.paneId === paneId && entry.tab.id === activeTabId
    ) || null;
  const currentIndex = activeEntry
    ? allTabs.findIndex(
        (entry) =>
          entry.paneId === activeEntry.paneId &&
          entry.tab.id === activeEntry.tab.id
      )
    : -1;

  // Get project name for current session
  const projectName = session?.project_id
    ? projects.find((p) => p.id === session.project_id)?.name
    : activeEntry?.projectLabel || null;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allTabs.length - 1;

  const getTabName = (tab: TabData) => {
    if (tab.sessionId) {
      const tabSession = sessions.find((s) => s.id === tab.sessionId);
      return tabSession?.name || tab.attachedTmux || "Session";
    }
    if (tab.attachedTmux) return tab.attachedTmux;
    return "New Tab";
  };

  const getProjectName = (tab: TabData) => {
    if (!tab.sessionId) return null;
    const tabSession = sessions.find((s) => s.id === tab.sessionId);
    if (!tabSession?.project_id) return null;
    const tabProject = projects.find((p) => p.id === tabSession.project_id);
    return tabProject?.name && tabProject.name !== "Uncategorized"
      ? tabProject.name
      : null;
  };

  const getDisplayName = (tab: TabData, groupTabs: MobileTabListEntry[]) => {
    const baseName = getTabName(tab);
    const matchingTabs = groupTabs.filter((candidate) => {
      return getTabName(candidate.tab) === baseName;
    });
    if (matchingTabs.length <= 1) return baseName;

    const instanceNumber =
      matchingTabs.findIndex((candidate) => candidate.tab.id === tab.id) + 1;
    return instanceNumber <= 1 ? baseName : `${baseName} #${instanceNumber}`;
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasPrev) {
      const prevEntry = allTabs[currentIndex - 1];
      onTabSwitch(prevEntry.paneId, prevEntry.tab.id);
    }
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasNext) {
      const nextEntry = allTabs[currentIndex + 1];
      onTabSwitch(nextEntry.paneId, nextEntry.tab.id);
    }
  };

  return (
    <div
      className="bg-muted flex items-center gap-2 px-2 py-1.5"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Menu button */}
      {onMenuClick && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onMenuClick();
          }}
          className="h-8 w-8 shrink-0"
        >
          <Menu className="h-4 w-4" />
        </Button>
      )}

      {/* Tab navigation */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <button
          type="button"
          onClick={handlePrev}
          onTouchEnd={(e) => e.stopPropagation()}
          disabled={!hasPrev}
          className="hover:bg-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Project/tab selector dropdown */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hover:bg-accent active:bg-accent flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1"
            >
              <span className="truncate text-sm font-medium">
                {activeTab ? getTabName(activeTab) : "No tab"}
                {projectName && projectName !== "Uncategorized" && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    [{projectName}]
                  </span>
                )}
              </span>
              <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            className="max-h-[360px] min-w-[240px] overflow-y-auto"
          >
            {projectGroups.map((group) => (
              <div key={group.projectId}>
                <div className="text-muted-foreground px-2 py-1 text-[11px] font-medium">
                  {group.projectLabel}
                </div>
                {group.entries.map((entry) => {
                  const isActive =
                    entry.paneId === paneId && entry.tab.id === activeTabId;

                  return (
                    <DropdownMenuItem
                      key={`${entry.paneId}:${entry.tab.id}`}
                      onSelect={() => onTabSwitch(entry.paneId, entry.tab.id)}
                      className={cn(
                        "flex items-center gap-2",
                        isActive && "bg-accent"
                      )}
                    >
                      <Circle
                        className={cn(
                          "h-2 w-2",
                          isActive
                            ? "fill-primary text-primary"
                            : "text-muted-foreground"
                        )}
                      />
                      <span className="flex-1 truncate">
                        {getDisplayName(entry.tab, group.entries)}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={handleNext}
          onTouchEnd={(e) => e.stopPropagation()}
          disabled={!hasNext}
          className="hover:bg-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {activeTab && tabs.length > 1 && (
        <button
          type="button"
          aria-label="Close current tab"
          title="Close current tab"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTabClose(activeTab.id);
          }}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <button
        type="button"
        aria-label="Reload page"
        title="Reload page"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onReloadPage();
        }}
        className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
      >
        <RotateCw className="h-4 w-4" />
      </button>

      {/* View mode toggle */}
      {session?.working_directory && (
        <div className="bg-accent/50 flex shrink-0 items-center rounded-md p-0.5">
          <ViewModeButton
            mode="terminal"
            currentMode={viewMode}
            icon={TerminalIcon}
            onClick={onViewModeChange}
          />
          <ViewModeButton
            mode="files"
            currentMode={viewMode}
            icon={FolderOpen}
            onClick={onViewModeChange}
          />
          <ViewModeButton
            mode="git"
            currentMode={viewMode}
            icon={GitBranch}
            onClick={onViewModeChange}
          />
          {isConductor && (
            <ViewModeButton
              mode="workers"
              currentMode={viewMode}
              icon={Users}
              onClick={onViewModeChange}
              badge={
                <span className="bg-primary/20 text-primary rounded px-1 text-[10px]">
                  {workerCount}
                </span>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
