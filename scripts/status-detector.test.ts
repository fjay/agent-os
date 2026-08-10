import assert from "node:assert/strict";
import { __statusDetectorTestUtils } from "../lib/status-detector";

const { getWaitingFingerprint } = __statusDetectorTestUtils;

assert.ok(
  getWaitingFingerprint(
    ["Do you want to allow this command?", "> 1. Yes", "  2. No"].join("\n"),
    "claude"
  )
);

assert.ok(getWaitingFingerprint("Approve? run command [Y/n]", "codex"));

assert.ok(getWaitingFingerprint("Press Enter to continue", "gemini"));

assert.equal(getWaitingFingerprint("> ", "aider"), null);
assert.equal(getWaitingFingerprint("$ ", "shell"), null);
assert.equal(
  getWaitingFingerprint("The command was approved by CI", "codex"),
  null
);

console.log("status-detector tests passed");
