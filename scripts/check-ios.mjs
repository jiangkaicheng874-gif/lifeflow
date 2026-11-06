import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
console.log(`Host: ${process.platform}; Node: ${process.version}`);
console.log(
  `iOS project: ${existsSync("ios/App/App.xcodeproj") ? "generated" : "not generated"}`,
);
if (process.platform !== "darwin") {
  console.error(
    "iOS compilation requires a Mac with full Xcode. Windows supports the web/API project.",
  );
  process.exitCode = 1;
} else {
  const result = spawnSync("xcodebuild", ["-version"], { encoding: "utf8" });
  console.log((result.stdout || result.stderr).trim());
  if (result.status !== 0) {
    console.error(
      "BLOCKED: full Xcode is unavailable. Project generation is not native build verification.",
    );
    process.exitCode = 1;
  }
}
