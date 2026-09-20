import fs from "node:fs";
import path from "node:path";

export async function alert(
  message: string,
  opts: { dataDir: string; webhookUrl?: string }
): Promise<void> {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  const logPath = path.join(opts.dataDir, "ALERTS.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, line, "utf8");
  console.error("ALERT:", message);

  if (opts.webhookUrl) {
    try {
      await fetch(opts.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      });
    } catch (err) {
      console.error("Webhook failed:", err);
    }
  }
}
