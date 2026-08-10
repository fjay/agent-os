/**
 * Session Status Detection System
 *
 * States:
 * - "running" (GREEN): Sustained activity within cooldown period
 * - "waiting" (YELLOW): Explicit prompt is asking for user input
 * - "idle" (GRAY): Not running and not asking for input
 * - "dead": Session doesn't exist
 *
 * Detection Strategy:
 * 1. Busy indicators + recent activity (highest priority - actively working)
 * 2. Waiting patterns - user input needed
 * 3. Spike detection - activity timestamp changes (2+ in 1s = sustained)
 * 4. Cooldown - 2s grace period after activity stops
 */

import { exec } from "child_process";
import { promisify } from "util";
import { getProvider, type AgentType } from "./providers";

const execAsync = promisify(exec);

// Configuration constants
const CONFIG = {
  ACTIVITY_COOLDOWN_MS: 2000, // Grace period after activity
  SPIKE_WINDOW_MS: 1000, // Window to detect sustained activity
  SUSTAINED_THRESHOLD: 2, // Changes needed to confirm activity
  CACHE_VALIDITY_MS: 2000, // How long tmux cache is valid
} as const;

// Detection patterns
const BUSY_INDICATORS = [
  "esc to interrupt",
  "(esc to interrupt)",
  "· esc to interrupt",
];

const SPINNER_CHARS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const WHIMSICAL_WORDS = [
  "accomplishing",
  "actioning",
  "actualizing",
  "baking",
  "booping",
  "brewing",
  "calculating",
  "cerebrating",
  "channelling",
  "churning",
  "clauding",
  "coalescing",
  "cogitating",
  "combobulating",
  "computing",
  "concocting",
  "conjuring",
  "considering",
  "contemplating",
  "cooking",
  "crafting",
  "creating",
  "crunching",
  "deciphering",
  "deliberating",
  "determining",
  "discombobulating",
  "divining",
  "doing",
  "effecting",
  "elucidating",
  "enchanting",
  "envisioning",
  "finagling",
  "flibbertigibbeting",
  "forging",
  "forming",
  "frolicking",
  "generating",
  "germinating",
  "hatching",
  "herding",
  "honking",
  "hustling",
  "ideating",
  "imagining",
  "incubating",
  "inferring",
  "jiving",
  "manifesting",
  "marinating",
  "meandering",
  "moseying",
  "mulling",
  "mustering",
  "musing",
  "noodling",
  "percolating",
  "perusing",
  "philosophising",
  "pondering",
  "pontificating",
  "processing",
  "puttering",
  "puzzling",
  "reticulating",
  "ruminating",
  "scheming",
  "schlepping",
  "shimmying",
  "shucking",
  "simmering",
  "smooshing",
  "spelunking",
  "spinning",
  "stewing",
  "sussing",
  "synthesizing",
  "thinking",
  "tinkering",
  "transmuting",
  "unfurling",
  "unravelling",
  "vibing",
  "wandering",
  "whirring",
  "wibbling",
  "wizarding",
  "working",
  "wrangling",
];

const DEFAULT_WAITING_PATTERNS = [
  /\[Y\/n\]/i,
  /\[y\/N\]/i,
  /Allow\?/i,
  /Approve\?/i,
  /Continue\?/i,
  /Press Enter (?:to )?(?:continue|confirm|proceed|accept|retry)/i,
  /waiting for input/i,
  /\(yes\/no\)/i,
  /Do you want to/i,
  /Enter to confirm.*Esc to cancel/i,
  />\s*1\.\s*Yes/,
  /Yes, allow all/i,
  /allow all edits/i,
  /allow all commands/i,
];

export type SessionStatus = "running" | "waiting" | "idle" | "dead";

interface StateTracker {
  lastChangeTime: number;
  lastActivityTimestamp: number;
  spikeWindowStart: number | null;
  spikeChangeCount: number;
  lastUserInputAt: number;
  lastWaitingFingerprint: string | null;
  suppressedWaitingFingerprint: string | null;
}

interface SessionCache {
  data: Map<string, number>;
  updatedAt: number;
}

// Content analysis helpers
function checkBusyIndicators(content: string): boolean {
  const lines = content.split("\n");
  // Focus on last 10 lines to avoid old scrollback false positives
  const recentContent = lines.slice(-10).join("\n").toLowerCase();

  // Check text indicators in recent lines
  if (BUSY_INDICATORS.some((ind) => recentContent.includes(ind))) return true;

  // Check whimsical words + "tokens" pattern in recent lines
  if (
    recentContent.includes("tokens") &&
    WHIMSICAL_WORDS.some((w) => recentContent.includes(w))
  )
    return true;

  // Check spinners in last 5 lines
  const last5 = lines.slice(-5).join("");
  if (SPINNER_CHARS.some((s) => last5.includes(s))) return true;

  return false;
}

function normalizeTerminalLine(line: string): string {
  return line
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getRecentContent(content: string): string {
  return content
    .split("\n")
    .slice(-8)
    .map(normalizeTerminalLine)
    .filter(Boolean)
    .join("\n");
}

function getWaitingPatterns(agentType?: AgentType): RegExp[] {
  if (!agentType) return DEFAULT_WAITING_PATTERNS;

  const provider = getProvider(agentType);
  if (provider.id === "shell") return [];

  return [...DEFAULT_WAITING_PATTERNS, ...provider.waitingPatterns];
}

function getWaitingFingerprint(
  content: string,
  agentType?: AgentType
): string | null {
  const recentContent = getRecentContent(content);
  if (!recentContent) return null;

  const patterns = getWaitingPatterns(agentType);
  if (!patterns.some((p) => p.test(recentContent))) return null;

  return recentContent;
}

class SessionStatusDetector {
  private trackers = new Map<string, StateTracker>();
  private cache: SessionCache = { data: new Map(), updatedAt: 0 };

  // Cache management
  async refreshCache(): Promise<void> {
    if (Date.now() - this.cache.updatedAt < CONFIG.CACHE_VALIDITY_MS) return;

    try {
      const { stdout } = await execAsync(
        `tmux list-sessions -F '#{session_name}\t#{session_activity}' 2>/dev/null || echo ""`
      );

      const newData = new Map<string, number>();
      for (const line of stdout.trim().split("\n")) {
        if (!line) continue;
        const [name, activity] = line.split("\t");
        if (name && activity) newData.set(name, parseInt(activity, 10) || 0);
      }

      this.cache = { data: newData, updatedAt: Date.now() };
    } catch {
      // Keep existing cache on error
    }
  }

  sessionExists(name: string): boolean {
    return this.cache.data.has(name);
  }

  getTimestamp(name: string): number {
    return this.cache.data.get(name) || 0;
  }

  async capturePane(name: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `tmux capture-pane -t "${name}" -p 2>/dev/null || echo ""`
      );
      return stdout.trim();
    } catch {
      return "";
    }
  }

  private getTracker(name: string, timestamp: number): StateTracker {
    let tracker = this.trackers.get(name);
    if (!tracker) {
      tracker = {
        lastChangeTime: Date.now() - CONFIG.ACTIVITY_COOLDOWN_MS,
        lastActivityTimestamp: timestamp,
        spikeWindowStart: null,
        spikeChangeCount: 0,
        lastUserInputAt: 0,
        lastWaitingFingerprint: null,
        suppressedWaitingFingerprint: null,
      };
      this.trackers.set(name, tracker);
    }
    return tracker;
  }

  // Spike detection: filters single activity spikes from sustained activity
  private processSpikeDetection(
    tracker: StateTracker,
    currentTimestamp: number
  ): "running" | null {
    const now = Date.now();
    const timestampChanged = tracker.lastActivityTimestamp !== currentTimestamp;

    if (timestampChanged) {
      tracker.lastActivityTimestamp = currentTimestamp;

      const windowExpired =
        tracker.spikeWindowStart === null ||
        now - tracker.spikeWindowStart > CONFIG.SPIKE_WINDOW_MS;

      if (windowExpired) {
        // Start new detection window
        tracker.spikeWindowStart = now;
        tracker.spikeChangeCount = 1;
      } else {
        // Within window - count change
        tracker.spikeChangeCount++;
        if (tracker.spikeChangeCount >= CONFIG.SUSTAINED_THRESHOLD) {
          // Sustained activity confirmed
          tracker.lastChangeTime = now;
          tracker.spikeWindowStart = null;
          tracker.spikeChangeCount = 0;
          return "running";
        }
      }
    } else if (
      tracker.spikeChangeCount === 1 &&
      tracker.spikeWindowStart !== null
    ) {
      // Check if single spike should be filtered
      if (now - tracker.spikeWindowStart > CONFIG.SPIKE_WINDOW_MS) {
        tracker.spikeWindowStart = null;
        tracker.spikeChangeCount = 0;
      }
    }

    return null;
  }

  private isInSpikeWindow(tracker: StateTracker): boolean {
    return (
      tracker.spikeWindowStart !== null &&
      Date.now() - tracker.spikeWindowStart < CONFIG.SPIKE_WINDOW_MS
    );
  }

  private isInCooldown(tracker: StateTracker): boolean {
    return Date.now() - tracker.lastChangeTime < CONFIG.ACTIVITY_COOLDOWN_MS;
  }

  private isSuppressedWaiting(
    tracker: StateTracker,
    fingerprint: string
  ): boolean {
    return tracker.suppressedWaitingFingerprint === fingerprint;
  }

  async getStatus(
    sessionName: string,
    agentType?: AgentType
  ): Promise<SessionStatus> {
    await this.refreshCache();

    // Dead check
    if (!this.sessionExists(sessionName)) {
      this.trackers.delete(sessionName);
      return "dead";
    }

    const timestamp = this.getTimestamp(sessionName);
    const tracker = this.getTracker(sessionName, timestamp);
    const content = await this.capturePane(sessionName);

    // 1. Busy indicators in last 10 lines (highest priority - Claude is actively working)
    // No activity timestamp check needed since we only look at recent terminal lines
    if (checkBusyIndicators(content)) {
      tracker.lastChangeTime = Date.now();
      return "running";
    }

    // 2. Waiting patterns (only if not actively running)
    const waitingFingerprint = getWaitingFingerprint(content, agentType);
    if (waitingFingerprint) {
      tracker.lastWaitingFingerprint = waitingFingerprint;
      if (!this.isSuppressedWaiting(tracker, waitingFingerprint)) {
        return "waiting";
      }
    } else {
      tracker.lastWaitingFingerprint = null;
      tracker.suppressedWaitingFingerprint = null;
    }

    // 3. Spike detection
    const spikeResult = this.processSpikeDetection(tracker, timestamp);
    if (spikeResult) return spikeResult;

    // 4. During spike window, maintain stable status
    if (this.isInSpikeWindow(tracker)) {
      return this.isInCooldown(tracker) ? "running" : "idle";
    }

    // 5. Cooldown check
    if (this.isInCooldown(tracker)) return "running";

    // 6. Cooldown expired
    return "idle";
  }

  async recordInput(sessionName: string, agentType?: AgentType): Promise<void> {
    await this.refreshCache();
    const timestamp = this.getTimestamp(sessionName);
    const tracker = this.getTracker(sessionName, timestamp);
    const content = await this.capturePane(sessionName);
    const waitingFingerprint = getWaitingFingerprint(content, agentType);

    tracker.lastUserInputAt = Date.now();
    tracker.suppressedWaitingFingerprint =
      waitingFingerprint || tracker.lastWaitingFingerprint;
  }

  acknowledge(sessionName: string): void {
    const tracker = this.trackers.get(sessionName);
    if (tracker) {
      tracker.lastUserInputAt = Date.now();
      tracker.suppressedWaitingFingerprint = tracker.lastWaitingFingerprint;
    }
  }

  async getAllStatuses(
    names: string[],
    agentType?: AgentType
  ): Promise<Map<string, SessionStatus>> {
    await this.refreshCache();
    const results = await Promise.all(
      names.map(async (name) => ({
        name,
        status: await this.getStatus(name, agentType),
      }))
    );
    return new Map(results.map((r) => [r.name, r.status]));
  }

  cleanup(): void {
    for (const [name] of this.trackers) {
      if (!this.sessionExists(name)) this.trackers.delete(name);
    }
  }
}

export const statusDetector = new SessionStatusDetector();

export const __statusDetectorTestUtils = {
  getWaitingFingerprint,
};
