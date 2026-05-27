#!/usr/bin/env bun
/**
 * import-flomo.ts — 解析 flomo 导出的 HTML 文件，将 memo 数据导入到 SQLite 数据库
 *
 * 用法: bun run script/import-flomo.ts [html文件路径]
 * 默认读取项目根目录下的 note0527.html
 */

import { initDb, importMemo, memoContentExists, getDb } from "../src/db";

// ====== 类型定义 ======

interface FlomoRecord {
    time: string;
    content: string;
    tags: string[];
}

// ====== HTML 实体解码 ======

const HTML_ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
};

function decodeHTMLEntities(text: string): string {
    return text.replace(
        /&(?:amp|lt|gt|quot|#39|apos|nbsp);/g,
        (match) => HTML_ENTITIES[match] ?? match,
    );
}

// ====== HTML 转纯文本 ======

/**
 * 将 HTML 内容转换为纯文本：
 * - <br> → 换行
 * - </p>, </li>, </h1>-</h6> → 换行
 * - </ul>, </ol> → 换行
 * - 去除其余所有 HTML 标签
 * - 解码 HTML 实体
 * - 合并多余空白行
 */
function htmlToPlainText(html: string): string {
    let text = html;

    // 处理自闭合标签
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<hr\s*\/?>/gi, "\n");

    // 块级元素结束标签 → 换行
    text = text.replace(/<\/(?:p|li|h[1-6]|div|tr)>/gi, "\n");

    // 列表/表格容器结束标签 → 换行
    text = text.replace(/<\/(?:ul|ol|table)>/gi, "\n");

    // 去除所有剩余标签
    text = text.replace(/<[^>]*>/g, "");

    // 解码 HTML 实体
    text = decodeHTMLEntities(text);

    // 规范化空白：合并连续换行，去除首尾空白
    text = text.replace(/\n{3,}/g, "\n\n").trim();

    return text;
}

// ====== 标签提取 ======

/**
 * 从纯文本中提取 #tagname 模式的标签。
 * 匹配 # 后跟非空白、非 #、非 <> 的连续字符。
 * 返回去重后的标签数组。
 */
function extractTags(text: string): string[] {
    const matches = text.match(/#([^\s#<>]+)/g);
    if (!matches) return [];

    // 去掉 # 前缀并去重
    const tags = matches.map((t) => t.slice(1));
    return [...new Set(tags)];
}

// ====== HTML 解析 ======

/**
 * 解析 flomo 导出的 HTML 文件，提取所有 memo 记录。
 * 每条记录包含 time、content（纯文本）、tags。
 */
function parseFlomoHTML(html: string): FlomoRecord[] {
    const records: FlomoRecord[] = [];

    // 匹配每个 <div class="memo"> ... </div> 块。
    // 终止于: 下一个同类 div、memos 容器结束（后跟 <script>）、或字符串末尾
    const memoRegex =
        /<div class="memo">\s*([\s\S]*?)<\/div>\s*(?=<div class="memo">|\s*<\/div>\s*<script|$)/g;

    let match: RegExpExecArray | null;
    while ((match = memoRegex.exec(html)) !== null) {
        const block = match[1]!;

        // 提取时间
        const timeMatch = block.match(
            /<div class="time">\s*(.*?)\s*<\/div>/,
        );
        const time = timeMatch ? timeMatch[1]!.trim() : "";

        // 提取内容 HTML
        const contentMatch = block.match(
            /<div class="content">\s*([\s\S]*?)\s*<\/div>/,
        );
        const contentHTML = contentMatch ? contentMatch[1]!.trim() : "";

        if (!contentHTML) continue;

        // HTML → 纯文本
        const plainText = htmlToPlainText(contentHTML);

        if (!plainText) continue;

        // 提取标签
        const tags = extractTags(plainText);

        records.push({ time, content: plainText, tags });
    }

    return records;
}

// ====== 主流程 ======

async function main(): Promise<void> {
    // 解析命令行参数，默认文件路径
    const args = process.argv.slice(2);
    const filePath = args[0] ?? "note0527.html";

    console.log(`📄 正在读取文件: ${filePath}`);

    // 读取 HTML 文件
    let html: string;
    try {
        const file = Bun.file(filePath);
        const exists = await file.exists();
        if (!exists) {
            console.error(`❌ 文件不存在: ${filePath}`);
            process.exit(1);
        }
        html = await file.text();
    } catch (err) {
        console.error(
            `❌ 读取文件失败: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
    }

    // 解析 HTML
    console.log("🔍 正在解析 HTML 中的 memo 记录...");
    const records = parseFlomoHTML(html);
    console.log(`   共解析到 ${records.length} 条记录`);

    if (records.length === 0) {
        console.log("⚠️  未找到任何 memo 记录，请检查文件格式");
        process.exit(0);
    }

    // 初始化数据库
    console.log("🗄️  正在初始化数据库...");
    initDb();

    // 逐条导入
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < records.length; i++) {
        const record = records[i]!;

        try {
            // 去重检查
            if (memoContentExists(record.content)) {
                skipped++;
                console.log(
                    `⏭️  [${i + 1}/${records.length}] 跳过（重复）: ${record.content.slice(0, 40)}...`,
                );
                continue;
            }

            // 导入
            const memo = importMemo({
                content: record.content,
                tags: record.tags,
                is_public: false,
                created_at: record.time || new Date().toISOString().replace("T", " ").slice(0, 19),
            });

            imported++;
            const tagInfo =
                record.tags.length > 0 ? ` [${record.tags.join(", ")}]` : "";
            console.log(
                `✅ [${i + 1}/${records.length}] ID:${memo.id}${tagInfo} — ${record.content.slice(0, 50)}${record.content.length > 50 ? "..." : ""}`,
            );
        } catch (err) {
            failed++;
            console.error(
                `❌ [${i + 1}/${records.length}] 导入失败: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    // WAL checkpoint: 将 WAL 日志合并回主数据库文件，确保外部工具能看到数据
    if (imported > 0) {
        console.log("\n💾 正在执行 WAL checkpoint...");
        const d = getDb();
        d.run("PRAGMA wal_checkpoint(TRUNCATE)");
        console.log("   Checkpoint 完成");
    }

    // 输出汇总
    console.log("\n" + "=".repeat(50));
    console.log("📊 导入完成");
    console.log(`   成功导入: ${imported} 条`);
    console.log(`   跳过(重复): ${skipped} 条`);
    if (failed > 0) {
        console.log(`   失败: ${failed} 条`);
    }
    console.log(`   总计处理: ${records.length} 条`);
}

main();
