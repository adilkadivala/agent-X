import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { acquireLock } from "../src/lock.js";

describe("acquireLock", () => {
  let lockPath: string;
  afterEach(() => {
    try {
      if (lockPath && fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  });

  it("acquires and releases", () => {
    lockPath = path.join(os.tmpdir(), `xagent-lock-${Date.now()}.lock`);
    const h = acquireLock(lockPath, { pid: process.pid });
    expect(h).not.toBeNull();
    expect(fs.existsSync(lockPath)).toBe(true);
    h!.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("second acquire fails while held", () => {
    lockPath = path.join(os.tmpdir(), `xagent-lock2-${Date.now()}.lock`);
    const h1 = acquireLock(lockPath, { pid: process.pid });
    expect(h1).not.toBeNull();
    const h2 = acquireLock(lockPath, { pid: process.pid + 99999 });
    expect(h2).toBeNull();
    h1!.release();
  });

  it("takes over stale lock from dead pid", () => {
    lockPath = path.join(os.tmpdir(), `xagent-lock3-${Date.now()}.lock`);
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 99999999, startedAt: new Date(0).toISOString() })
    );
    const h = acquireLock(lockPath, { pid: process.pid, staleMs: 1000 });
    expect(h).not.toBeNull();
    h!.release();
  });
});
