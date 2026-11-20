// "Last updated" for each doc from one `git log` call. Without git (a source archive, a shallow CI checkout that
// fails) the dates are simply left out.
import { execFileSync } from "node:child_process";

/** Repository path → date (YYYY-MM-DD) of the last commit that touched it, for files under the given paths. */
export function lastUpdated(root, paths) {
  const dates = new Map();
  let output = "";
  try {
    output = execFileSync("git", ["log", "--format=@%cs", "--name-only", "--no-renames", "--", ...paths], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return dates;
  }
  let date = null;
  for (const line of output.split("\n")) {
    if (line.startsWith("@")) date = line.slice(1).trim();
    else if (line.trim() && date && !dates.has(line.trim())) dates.set(line.trim(), date);
  }
  return dates;
}
