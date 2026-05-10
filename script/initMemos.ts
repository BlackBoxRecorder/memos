import { initDb, getMemos, createMemo } from "../src/db";
import { readFileSync } from "fs";

// Resolve path relative to this script
const memoFilePath = new URL("memos.txt", import.meta.url).pathname;

// Initialize database tables if not exist
initDb();

// Read memos.txt
let rawContent: string;
try {
  rawContent = readFileSync(memoFilePath, "utf-8");
} catch (err) {
  console.error("❌ 无法读取 memos.txt 文件:", (err as Error).message);
  process.exit(1);
}

// Split by "---" delimiter and trim whitespace
const entries = rawContent
  .split("---")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`📄 从 memos.txt 中解析出 ${entries.length} 个 memo 条目`);

// Build a set of existing memo contents for deduplication
const existingMemos = getMemos({ includePrivate: true });
const existingContents = new Set(existingMemos.map((m) => m.content));

let insertedCount = 0;
let skippedCount = 0;
let errorCount = 0;

for (const entry of entries) {
  // Skip if exact same content already exists
  if (existingContents.has(entry)) {
    skippedCount++;
    continue;
  }

  try {
    createMemo(entry, true);
    // Also add to the set so we don't try to insert duplicates within the same batch
    existingContents.add(entry);
    insertedCount++;
  } catch (err) {
    errorCount++;
    const preview = entry.length > 60 ? entry.substring(0, 60) + "..." : entry;
    console.error(`❌ 插入失败 [${preview}]:`, (err as Error).message);
  }
}

// Output statistics
console.log("\n========== 初始化完成 ==========");
console.log(`✅ 成功插入: ${insertedCount} 条`);
console.log(`⏭️  跳过 (重复): ${skippedCount} 条`);
if (errorCount > 0) {
  console.log(`❌ 失败: ${errorCount} 条`);
}
console.log(`📊 总条目数: ${entries.length} 条`);
