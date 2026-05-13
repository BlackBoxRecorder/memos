// Embedding cache & semantic search engine
// Pure in-memory cosine similarity, no SQLite extensions needed

import {
  getAllEmbeddings,
  saveEmbedding,
  deleteEmbedding,
  getMemos,
} from "../db";
import { generateEmbedding, isAiAvailable } from "./service";
import { getAppConfig } from "../config/app-config";

// In-memory cache: memo_id → Float32Array
const cache = new Map<number, Float32Array>();

export async function initEmbeddingCache(): Promise<void> {
  if (!isAiAvailable().embedding) return;

  // 1. Load existing embeddings from DB
  const rows = getAllEmbeddings();
  for (const row of rows) {
    try {
      if (row.embedding) {
        const buf = row.embedding as Buffer;
        const arr = new Float32Array(
          buf.buffer,
          buf.byteOffset,
          buf.byteLength / 4,
        );
        cache.set(row.memo_id, arr);
      }
    } catch {
      // skip corrupt entries
    }
  }
  console.log(`Loaded ${cache.size} existing embeddings into cache`);

  // 2. Find memos without embeddings and generate them
  const allMemos = getMemos({ includePrivate: true });
  const missing = allMemos.filter((m) => !cache.has(m.id));

  if (missing.length === 0) {
    console.log("All memos have embeddings, nothing to generate");
    return;
  }

  console.log(
    `Generating embeddings for ${missing.length} memos without embeddings...`,
  );

  let generated = 0;
  for (const memo of missing) {
    try {
      await generateAndStoreEmbedding(memo.id, memo.content);
      generated++;
    } catch (err) {
      console.error(`Failed to generate embedding for memo ${memo.id}:`, err);
    }
  }

  console.log(
    `Generated ${generated} new embeddings, cache total: ${cache.size}`,
  );
}

export function upsertEmbedding(memoId: number, embedding: Float32Array): void {
  cache.set(memoId, embedding);
  const buf = Buffer.from(embedding.buffer);
  saveEmbedding(memoId, buf);
}

export function deleteEmbeddingCache(memoId: number): void {
  cache.delete(memoId);
  deleteEmbedding(memoId);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  const len = a.length;

  for (let i = 0; i < len; i++) {
    const va = a[i]!;
    const vb = b[i]!;
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function getSemanticResults(
  query: string,
  limit = 20,
): Promise<number[]> {
  if (!isAiAvailable().embedding || cache.size === 0) return [];

  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return [];

  const scored: Array<{ id: number; score: number }> = [];

  for (const [id, emb] of cache) {
    const score = cosineSimilarity(queryEmbedding, emb);
    if (score >= getAppConfig().embeddings.similarityThreshold) {
      scored.push({ id, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.id);
}

export function getSimilarMemoIds(memoId: number, limit = 5): number[] {
  const targetEmb = cache.get(memoId);
  if (!targetEmb) return [];

  const scored: Array<{ id: number; score: number }> = [];
  for (const [id, emb] of cache) {
    if (id === memoId) continue;
    const score = cosineSimilarity(targetEmb, emb);
    if (score >= getAppConfig().embeddings.similarityThreshold) {
      scored.push({ id, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.id);
}

export async function generateAndStoreEmbedding(
  memoId: number,
  content: string,
): Promise<void> {
  if (!isAiAvailable().embedding || !content.trim()) return;

  const embedding = await generateEmbedding(content);
  if (!embedding) return;

  upsertEmbedding(memoId, embedding);
}
