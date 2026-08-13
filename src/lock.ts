import fs from "node:fs";
import path from "node:path";

export type LockHandle = {
  release: () => void;
  path: string;
};

const STALE_MS_DEFAULT = 10 * 60 * 1000;

/**
 * Exclusive run lock covering DB + browser profile session.
 * Uses exclusive file open (wx) + pid; stale if pid dead or age > staleMs.
 */
export function acquireLock(
  lockPath: string,
  opts: { staleMs?: number; pid?: number } = {}
): LockHandle | null {
  const staleMs = opts.staleMs ?? STALE_MS_DEFAULT;
  const pid = opts.pid ?? process.pid;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, "utf8").trim();
      const data = JSON.parse(raw) as { pid: number; startedAt: string };
      const age = Date.now() - new Date(data.startedAt).getTime();
      const alive = isPidAlive(data.pid);
      if (alive && age < staleMs) {
        return null;
      }
      // stale — remove
      fs.unlinkSync(lockPath);
    } catch {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    }
  }

  try {
    const fd = fs.openSync(lockPath, "wx");
    const payload = JSON.stringify({
      pid,
      startedAt: new Date().toISOString(),
    });
    fs.writeFileSync(fd, payload, "utf8");
    fs.closeSync(fd);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return null;
    throw err;
  }

  let released = false;
  return {
    path: lockPath,
    release: () => {
      if (released) return;
      released = true;
      try {
        if (fs.existsSync(lockPath)) {
          const raw = fs.readFileSync(lockPath, "utf8");
          const data = JSON.parse(raw) as { pid: number };
          if (data.pid === pid) fs.unlinkSync(lockPath);
        }
      } catch {
        /* ignore */
      }
    },
  };
}

export function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
