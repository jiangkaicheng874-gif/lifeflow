import { spawnSync } from "node:child_process";
function git(args, capture = false) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.status !== 0)
    throw new Error(`git ${args[0]} failed. Check remote and authentication.`);
  return result.stdout?.trim();
}
try {
  if (process.argv[2] === "set") {
    const urls = process.argv.slice(3);
    if (urls.length !== 2)
      throw new Error("Usage: npm run remotes:set -- <github-url> <gitee-url>");
    const names = ["github", "gitee"];
    urls.forEach((url, i) => {
      const host = i === 0 ? "github.com" : "gitee.com";
      const valid =
        url.startsWith(`git@${host}:`) ||
        (url.startsWith(`https://${host}/`) &&
          !new URL(url).username &&
          !new URL(url).password);
      if (!valid || /\s/.test(url))
        throw new Error(`Expected ${host} URL without embedded credentials.`);
    });
    const existing = git(["remote"], true).split("\n");
    urls.forEach((url, i) =>
      git([
        "remote",
        existing.includes(names[i]) ? "set-url" : "add",
        names[i],
        url,
      ]),
    );
  } else if (process.argv[2] === "push") {
    if (git(["branch", "--show-current"], true) !== "main")
      throw new Error("Switch to main before dual push.");
    if (git(["status", "--porcelain"], true))
      throw new Error("Resolve uncommitted changes before dual push.");
    const failures = [];
    for (const remote of ["github", "gitee"]) {
      try {
        git(["push", remote, "main:main"]);
      } catch {
        failures.push(remote);
      }
    }
    if (failures.length)
      throw new Error(
        `Push incomplete: ${failures.join(", ")}. Retry after resolving access; successful pushes remain intact.`,
      );
  } else throw new Error("Expected set or push.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
