// prebuild: 把目前揪甘心專案的知識文件合併成 lib/knowledge.generated.ts。
// 不掃描 content/projects 的上層，避免其他專案（例如法律專案）誤混進同一份 prompt。
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectId = "jugansin";
const dataDir = join(root, "content", "projects", projectId, "knowledge");
const outFile = join(root, "lib", "knowledge.generated.ts");

const EXCLUDE = new Set(["README.md", "glossary.txt"]);

let files = [];
if (existsSync(dataDir)) {
  files = readdirSync(dataDir)
    .filter((f) => /\.(md|txt|markdown)$/i.test(f) && !EXCLUDE.has(f))
    .sort((a, b) => a.localeCompare(b, "zh-Hant-TW", { numeric: true }));
}

const sections = files.map((f) => {
  const body = readFileSync(join(dataDir, f), "utf8").trim();
  return `<document name="${f}">\n${body}\n</document>`;
});
const knowledge = sections.join("\n\n");

let glossary = [];
const glossaryPath = join(dataDir, "glossary.txt");
if (existsSync(glossaryPath)) {
  glossary = readFileSync(glossaryPath, "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}

const out = `// 此檔由 scripts/build-knowledge.mjs 自動產生，請勿手動編輯。
// 來源：content/projects/${projectId}/knowledge/ 下的 ${files.length} 份文件、${glossary.length} 個詞彙。
export const KNOWLEDGE_FILES: string[] = ${JSON.stringify(files)};
export const KNOWLEDGE_MD: string = ${JSON.stringify(knowledge)};
export const GLOSSARY_TERMS: string[] = ${JSON.stringify(glossary)};
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, out, "utf8");
console.log(
  `[knowledge] ${files.length} 份文件 (${(knowledge.length / 1000).toFixed(1)}k 字元), ${glossary.length} 個詞彙 → lib/knowledge.generated.ts`
);
// 上台前最容易漏掉的一件事：真實資料還沒放進來
if (files.length === 0 || (files.length === 1 && files[0] === "example.md")) {
  console.warn(`[knowledge] 警告：${dataDir} 只有範例文件，AI 不知道你的專案。請先補齊知識文件。`);
}
