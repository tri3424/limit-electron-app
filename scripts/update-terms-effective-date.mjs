import fs from "node:fs";
import path from "node:path";

function formatLocalISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const projectRoot = process.cwd();
const termsPath = path.join(projectRoot, "build", "terms-and-conditions.txt");

const today = formatLocalISODate(new Date());

const original = fs.readFileSync(termsPath, "utf8");

const lines = original.split(/\r\n|\n|\r/);
let updated = false;

const nextLines = lines.map((line) => {
  if (line.startsWith("Effective Date:")) {
    updated = true;
    return `Effective Date: ${today}`;
  }
  return line;
});

if (!updated) {
  throw new Error(`No 'Effective Date:' line found in ${termsPath}`);
}

const newline = original.includes("\r\n") ? "\r\n" : "\n";
const next = nextLines.join(newline);

if (next !== original) {
  fs.writeFileSync(termsPath, next, "utf8");
}
