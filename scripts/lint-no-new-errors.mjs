import { exec } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BASELINE_FILE = path.resolve(process.cwd(), "lint-baseline-unix.txt");
const SHOULD_WRITE_BASELINE = process.argv.includes("--write-baseline");
const CWD_NORMALIZED = process.cwd().replaceAll("\\", "/").replace(/\/+$/, "");

function extractIssueLines(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /:\d+:\d+:/.test(line))
    .map((line) => line.replaceAll("\\", "/"))
    .map((line) => line.replace(`${CWD_NORMALIZED}/`, ""))
    .map((line) => (line.startsWith("./") ? line.slice(2) : line));

  return Array.from(new Set(lines)).sort((left, right) => left.localeCompare(right));
}

async function runLint() {
  return new Promise((resolve, reject) => {
    exec("npx next lint --format unix", {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 1024 * 1024 * 20,
    }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") {
        reject(error);
        return;
      }

      resolve({
        code: typeof error?.code === "number" ? error.code : 0,
        output: `${stdout ?? ""}${stderr ?? ""}`,
      });
    });
  });
}

async function readBaseline() {
  try {
    return await readFile(BASELINE_FILE, "utf8");
  } catch {
    return null;
  }
}

function printIssues(title, issues) {
  console.error(title);
  issues.forEach((issue) => console.error(`- ${issue}`));
}

const { code, output } = await runLint();
const currentIssues = extractIssueLines(output);

if (SHOULD_WRITE_BASELINE) {
  await writeFile(BASELINE_FILE, currentIssues.join("\n") + (currentIssues.length > 0 ? "\n" : ""), "utf8");
  console.log(`Wrote lint baseline with ${currentIssues.length} issue(s): ${BASELINE_FILE}`);
  process.exit(0);
}

const baselineText = await readBaseline();
if (baselineText === null) {
  console.error(`Missing baseline file: ${BASELINE_FILE}`);
  console.error("Run `npm run lint:baseline` to create it.");
  process.exit(1);
}

const baselineIssues = new Set(extractIssueLines(baselineText));
const newIssues = currentIssues.filter((line) => !baselineIssues.has(line));

if (newIssues.length > 0) {
  printIssues(`Found ${newIssues.length} new lint issue(s) not present in baseline:`, newIssues);
  process.exit(1);
}

if (code !== 0 && currentIssues.length === 0) {
  console.error("`next lint` failed without parseable issue lines:");
  console.error(output);
  process.exit(code);
}

console.log(
  `No new lint issues. Current issues: ${currentIssues.length}. Baseline issues: ${baselineIssues.size}.`
);
