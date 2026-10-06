/**
 * Cuts a release: `bun run release 0.2.0`.
 *
 * The version lives in one place, package.json, and the app shows it in its footer. This script makes sure the
 * changelog has a section for the new version, writes the version into package.json, commits, tags `v0.2.0`
 * and pushes the branch and the tag. The GitHub workflow in .github/workflows/release.yml then publishes the
 * release for that tag, with the changelog section as its notes, so the release on GitHub, the tag and the
 * version in the app always say the same thing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const version = process.argv[2];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function run(cmd: string[]): string {
  const result = Bun.spawnSync(cmd, { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) fail(`${cmd.join(" ")} failed:\n${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) fail("Usage: bun run release <major.minor.patch>, for example: bun run release 0.2.0");

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
if (pkg.version === version) fail(`package.json is already at ${version}.`);

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
if (!new RegExp(`^## ${version.replace(/\./g, "\.")}( |$)`, "m").test(changelog)) {
  fail(`CHANGELOG.md has no "## ${version}" section. Write what changed first, then release.`);
}

if (run(["git", "status", "--porcelain"]) !== "") fail("The working tree has uncommitted changes. Commit or stash them first.");
if (run(["git", "tag", "--list", `v${version}`]) !== "") fail(`The tag v${version} already exists.`);

writeFileSync(pkgPath, readFileSync(pkgPath, "utf8").replace(/"version": "[^"]+"/, `"version": "${version}"`));
console.log(`package.json: ${pkg.version} -> ${version}`);

run(["git", "add", "package.json"]);
run(["git", "commit", "-m", `Release ${version}`]);
run(["git", "tag", "-a", `v${version}`, "-m", `Asset Prompter ${version}`]);
const branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
run(["git", "push", "origin", branch]);
run(["git", "push", "origin", `v${version}`]);
console.log(`Tagged v${version} and pushed ${branch}. GitHub publishes the release in a minute:`);
console.log(`https://github.com/Djordje1998/asset-prompter/releases/tag/v${version}`);
