#!/usr/bin/env bun
// memocli — 命令行工具，通过 HTTP API 创建 memo
// 用法: memocli -c "内容" [-t "标签1,标签2"] [-p]
// 需要设置环境变量 MEMOS_API_URL 和 MEMOS_SECRET_KEY

const BASE_URL =
  process.env.MEMOS_API_URL ||
  `http://localhost:${parseInt(process.env.PORT || "3020")}`;
const SECRET_KEY = process.env.MEMOS_SECRET_KEY;

// --- 参数解析 ---

interface Options {
  content: string | null;
  tags: string[];
  isPublic: boolean;
  showHelp: boolean;
}

function parseArgs(args: string[]): Options {
  const opts: Options = {
    content: null,
    tags: [],
    isPublic: false,
    showHelp: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-c":
      case "--content":
        opts.content = args[++i] ?? null;
        break;
      case "-t":
      case "--tag": {
        const raw = args[++i];
        if (raw) {
          opts.tags = raw
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        }
        break;
      }
      case "-p":
      case "--public":
        opts.isPublic = true;
        break;
      case "--private":
        opts.isPublic = false;
        break;
      case "-h":
      case "--help":
        opts.showHelp = true;
        break;
    }
  }

  return opts;
}

function printHelp(): void {
  console.log(`
memo — 命令行备忘录创建工具

用法:
  memocli -c "内容" [选项]

选项:
  -c, --content <text>   备忘录内容（必需）
  -t, --tag <tags>       标签（可选，多个用逗号分隔，例如 "技术,笔记"）
  -p, --public           设为公开
  --private              设为私有（默认）
  -h, --help             显示帮助信息

环境变量:
  MEMOS_API_URL          API 地址（可选，默认 http://localhost:3020）
  MEMOS_SECRET_KEY       服务端密钥（必需）

示例:
  memocli -c "今天学习了 Bun"
  memocli -c "部署笔记" -t "技术,部署" --private
`);
}

// --- 主流程 ---

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.showHelp) {
    printHelp();
    process.exit(0);
  }

  // 校验密钥
  if (!SECRET_KEY) {
    console.error("\u274C 错误: 未设置 MEMOS_SECRET_KEY 环境变量");
    process.exit(1);
  }

  // 校验内容
  if (!opts.content || opts.content.trim().length === 0) {
    console.error("\u274C 错误: 请使用 -c 或 --content 提供备忘录内容");
    console.error("   使用 -h 查看帮助");
    process.exit(1);
  }

  // 构建请求体
  const body: Record<string, unknown> = {
    content: opts.content.trim(),
    is_public: opts.isPublic,
  };
  if (opts.tags.length > 0) body.tags = opts.tags;

  // 发送请求
  try {
    const resp = await fetch(`${BASE_URL}/api/memos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SECRET_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    if (resp.ok) {
      const memo = data.memo;
      console.log(`\u2705 备忘录创建成功 (ID: ${memo.id})`);
      console.log(`   内容: ${memo.content}`);
      if (memo.tags && memo.tags.length > 0)
        console.log(`   标签: ${memo.tags.join(", ")}`);
      console.log(`   可见性: ${memo.is_public ? "公开" : "私有"}`);
    } else {
      const errorMsg = data.error || `HTTP ${resp.status}`;
      console.error(`\u274C 请求失败: ${errorMsg}`);
      if (resp.status === 401) {
        console.error("   请检查 MEMOS_SECRET_KEY 是否正确");
      }
      if (resp.status === 429) {
        console.error("   请求频率超限，请稍后再试");
      }
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\u274C 请求错误: ${message}`);
    if (
      message.includes("ECONNREFUSED") ||
      message.includes("ConnectionRefused")
    ) {
      console.error(`   请确保服务已启动: bun run dev`);
    }
    process.exit(1);
  }
}

main();
