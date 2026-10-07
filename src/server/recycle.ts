import { existsSync, statSync } from "node:fs";
import { UserError } from "./actions";

/**
 * Moves a file or folder to the computer's own recycle bin, so even "delete for good" in the app can be undone
 * from the desktop. Windows uses the shell's recycle bin through PowerShell, macOS the Finder, Linux the
 * freedesktop trash through gio (or trash-cli). Nothing here deletes outright.
 */
export async function recycle(path: string): Promise<void> {
  if (!existsSync(path)) throw new UserError(`${path} does not exist.`);
  const folder = statSync(path).isDirectory();
  if (process.platform === "win32") {
    // The path goes in through the environment, never into the command text: PowerShell also ends a quoted
    // string at the curly quotes ‘ and ’, which a folder name may hold, so no escaping of it is safe.
    const method = folder ? "DeleteDirectory" : "DeleteFile";
    await run(
      ["powershell", "-NoProfile", "-NonInteractive", "-Command", `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${method}($env:ASSET_PROMPTER_RECYCLE, 'OnlyErrorDialogs', 'SendToRecycleBin')`],
      "Windows could not move it to the Recycle Bin",
      { ASSET_PROMPTER_RECYCLE: path },
    );
  } else if (process.platform === "darwin") {
    // An AppleScript string escapes both the backslash and the double quote.
    const quoted = path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await run(["osascript", "-e", `tell application "Finder" to delete POSIX file "${quoted}"`], "Finder could not move it to the Trash");
  } else if (Bun.which("gio")) {
    await run(["gio", "trash", path], "gio could not move it to the trash");
  } else if (Bun.which("trash-put")) {
    await run(["trash-put", path], "trash-put could not move it to the trash");
  } else {
    throw new UserError("No trash tool was found. Install gio (part of GLib) or trash-cli, or delete the files by hand.");
  }
  if (existsSync(path)) throw new UserError("The files are still there; the system did not move them to the recycle bin.");
}

async function run(cmd: string[], failure: string, env: Record<string, string> = {}): Promise<void> {
  const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe", env: { ...process.env, ...env } });
  const stderr = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) throw new UserError(`${failure}: ${stderr.trim() || "unknown error"}`);
}
