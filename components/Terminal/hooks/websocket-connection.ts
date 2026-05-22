"use client";

import type { Terminal as XTerm } from "@xterm/xterm";
import { WS_RECONNECT_BASE_DELAY, WS_RECONNECT_MAX_DELAY } from "../constants";

const WS_HEARTBEAT_INTERVAL_MS = 20000;
const WS_PROBE_TIMEOUT_MS = 1500;
const WS_RESUME_DELAY_MS = 250;
const WS_SUSPEND_THRESHOLD_MS = 30000;
const MOBILE_HIDDEN_RECONNECT_MS = 5000;

export interface WebSocketCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onConnectionStateChange: (
    state: "connecting" | "connected" | "disconnected" | "reconnecting"
  ) => void;
  onSetConnected: (connected: boolean) => void;
}

export interface WebSocketManager {
  ws: WebSocket;
  sendInput: (data: string) => void;
  sendCommand: (command: string) => void;
  sendResize: (cols: number, rows: number) => void;
  reconnect: () => void;
  cleanup: () => void;
}

export function createWebSocketConnection(
  term: XTerm,
  callbacks: WebSocketCallbacks,
  wsRef: React.MutableRefObject<WebSocket | null>,
  reconnectTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  reconnectDelayRef: React.MutableRefObject<number>,
  intentionalCloseRef: React.MutableRefObject<boolean>
): WebSocketManager {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;
  const prefersAggressiveReconnect = shouldUseAggressiveReconnect();
  const pendingMessages: string[] = [];

  let hiddenAt: number | null =
    document.visibilityState === "hidden" ? Date.now() : null;
  let resumeTimeout: ReturnType<typeof setTimeout> | null = null;
  let probeTimeout: ReturnType<typeof setTimeout> | null = null;
  let probeSocket: WebSocket | null = null;
  let lastClockTick = Date.now();
  let lastPongAt = Date.now();

  const clearPendingMessages = () => {
    pendingMessages.length = 0;
  };

  const flushPendingMessages = (socket: WebSocket) => {
    if (wsRef.current !== socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (pendingMessages.length > 0) {
      const payload = pendingMessages.shift();
      if (!payload) continue;

      if (wsRef.current !== socket || socket.readyState !== WebSocket.OPEN) {
        pendingMessages.unshift(payload);
        return;
      }

      socket.send(payload);
    }
  };

  const clearProbe = () => {
    if (probeTimeout) {
      clearTimeout(probeTimeout);
      probeTimeout = null;
    }
    probeSocket = null;
  };

  const createSocket = () => {
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      lastPongAt = Date.now();
      clearProbe();
      callbacks.onSetConnected(true);
      callbacks.onConnectionStateChange("connected");
      reconnectDelayRef.current = WS_RECONNECT_BASE_DELAY;
      callbacks.onConnected?.();
      sendResize(term.cols, term.rows);
      flushPendingMessages(socket);
      term.focus();
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "pong") {
          if (wsRef.current !== socket) return;
          lastPongAt = Date.now();
          clearProbe();
          flushPendingMessages(socket);
          return;
        }

        if (msg.type === "output") {
          const buffer = term.buffer.active;
          const scrollYBefore = buffer.viewportY;
          const wasAtTop = scrollYBefore <= 0;
          const wasAtBottom = scrollYBefore >= buffer.baseY;

          term.write(msg.data);

          requestAnimationFrame(() => {
            const scrollYAfter = term.buffer.active.viewportY;
            const isNowAtTop = scrollYAfter <= 0;

            if (isNowAtTop && !wasAtTop && !wasAtBottom && scrollYBefore > 5) {
              term.scrollToLine(scrollYBefore);
            }
          });
        } else if (msg.type === "exit") {
          term.write("\r\n\x1b[33m[Session ended]\x1b[0m\r\n");
        }
      } catch {
        term.write(event.data);
      }
    };

    socket.onclose = () => {
      if (wsRef.current === socket) {
        wsRef.current = null;
      }
      clearProbe();
      callbacks.onSetConnected(false);
      callbacks.onDisconnected?.();

      if (intentionalCloseRef.current) {
        callbacks.onConnectionStateChange("disconnected");
        return;
      }

      callbacks.onConnectionStateChange("disconnected");

      const currentDelay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(
        currentDelay * 2,
        WS_RECONNECT_MAX_DELAY
      );
      reconnectTimeoutRef.current = setTimeout(attemptReconnect, currentDelay);
    };

    socket.onerror = () => {
      // Errors are handled by onclose
    };

    return socket;
  };

  const sendResize = (cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  };

  const sendWithProbeAwareness = (payload: string) => {
    const currentWs = wsRef.current;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;

    if (probeSocket === currentWs) {
      pendingMessages.push(payload);
      return;
    }

    if (wasBrowserSuspended()) {
      pendingMessages.push(payload);
      if (!startProbe()) {
        scheduleHealthCheck(prefersAggressiveReconnect ? "reconnect" : "probe");
      }
      return;
    }

    currentWs.send(payload);
  };

  const sendInput = (data: string) => {
    sendWithProbeAwareness(JSON.stringify({ type: "input", data }));
  };

  const sendCommand = (command: string) => {
    sendWithProbeAwareness(JSON.stringify({ type: "command", data: command }));
  };

  const forceReconnect = () => {
    if (intentionalCloseRef.current) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    clearProbe();

    const oldWs = wsRef.current;
    if (oldWs) {
      oldWs.onopen = null;
      oldWs.onmessage = null;
      oldWs.onclose = null;
      oldWs.onerror = null;
      try {
        oldWs.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }

    callbacks.onConnectionStateChange("reconnecting");
    reconnectDelayRef.current = WS_RECONNECT_BASE_DELAY;

    createSocket();
  };

  const attemptReconnect = () => {
    if (intentionalCloseRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    forceReconnect();
  };

  const startProbe = () => {
    if (intentionalCloseRef.current) return false;
    if (document.visibilityState !== "visible") return false;

    const currentWs = wsRef.current;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return false;
    if (probeSocket === currentWs) return true;

    clearProbe();
    probeSocket = currentWs;

    try {
      currentWs.send(JSON.stringify({ type: "ping" }));
    } catch {
      clearProbe();
      return false;
    }

    probeTimeout = setTimeout(() => {
      if (intentionalCloseRef.current) return;
      if (probeSocket !== currentWs) return;
      clearProbe();

      if (
        wsRef.current === currentWs &&
        currentWs.readyState === WebSocket.OPEN
      ) {
        forceReconnect();
      }
    }, WS_PROBE_TIMEOUT_MS);

    return true;
  };

  const runHealthCheck = (mode: "probe" | "reconnect") => {
    if (intentionalCloseRef.current) return;
    if (document.visibilityState !== "visible") return;

    if (mode === "reconnect") {
      forceReconnect();
      return;
    }

    const currentWs = wsRef.current;
    if (
      !currentWs ||
      currentWs.readyState === WebSocket.CLOSED ||
      currentWs.readyState === WebSocket.CLOSING ||
      currentWs.readyState === WebSocket.CONNECTING
    ) {
      forceReconnect();
      return;
    }

    if (Date.now() - lastPongAt < 1000 && !probeSocket) {
      return;
    }

    startProbe();
  };

  const scheduleHealthCheck = (mode: "probe" | "reconnect" = "probe") => {
    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
    }

    resumeTimeout = setTimeout(() => {
      resumeTimeout = null;
      runHealthCheck(mode);
    }, WS_RESUME_DELAY_MS);
  };

  const sleepCheckInterval = window.setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastClockTick;
    lastClockTick = now;

    if (elapsed > WS_SUSPEND_THRESHOLD_MS) {
      scheduleHealthCheck(prefersAggressiveReconnect ? "reconnect" : "probe");
    }
  }, 10000);

  const heartbeatInterval = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastPongAt < WS_HEARTBEAT_INTERVAL_MS / 2) return;
    startProbe();
  }, WS_HEARTBEAT_INTERVAL_MS);

  const wasBrowserSuspended = () => {
    const now = Date.now();
    const elapsed = now - lastClockTick;
    lastClockTick = now;
    return elapsed > WS_SUSPEND_THRESHOLD_MS;
  };

  term.onData((data) => {
    sendInput(data);
  });

  term.attachCustomKeyEventHandler((event) => {
    if (event.type === "keydown" && event.key === "Enter" && event.shiftKey) {
      sendInput("\n");
      return false;
    }
    return true;
  });

  const handleVisibilityChange = () => {
    if (intentionalCloseRef.current) return;

    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }

    // Page became visible
    if (document.visibilityState !== "visible") return;

    const wasHiddenFor = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = null;

    if (
      prefersAggressiveReconnect &&
      wasHiddenFor > MOBILE_HIDDEN_RECONNECT_MS
    ) {
      scheduleHealthCheck("reconnect");
      return;
    }

    scheduleHealthCheck("probe");
  };

  const handleResume = () => {
    if (wasBrowserSuspended() && prefersAggressiveReconnect) {
      scheduleHealthCheck("reconnect");
      return;
    }
    scheduleHealthCheck("probe");
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pageshow", handleResume);
  window.addEventListener("focus", handleResume);
  window.addEventListener("online", handleResume);

  const ws = createSocket();

  const cleanup = () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pageshow", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("online", handleResume);
    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
      resumeTimeout = null;
    }
    clearProbe();
    clearPendingMessages();
    window.clearInterval(sleepCheckInterval);
    window.clearInterval(heartbeatInterval);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    const currentWs = wsRef.current;
    if (
      currentWs &&
      (currentWs.readyState === WebSocket.OPEN ||
        currentWs.readyState === WebSocket.CONNECTING)
    ) {
      currentWs.close(1000, "Component unmounting");
    }
  };

  return {
    ws,
    sendInput,
    sendCommand,
    sendResize,
    reconnect: forceReconnect,
    cleanup,
  };
}

function shouldUseAggressiveReconnect() {
  const ua = navigator.userAgent || "";
  const isTouchMac =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return /Android|iPhone|iPad|iPod/i.test(ua) || isTouchMac;
}
