// Embedding cache & semantic search engine
// Pure in-memory cosine similarity, no SQLite extensions needed

import {
  getAllEmbeddings,
  saveEmbedding,
  deleteEmbedding,
  getMemos,
} from "../db";
import { generateEmbedding, isAiAvailable, rerankDocuments } from "./service";
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
  // Use byteOffset/byteLength to handle Float32Array subviews correctly
  const buf = Buffer.from(
    embedding.buffer,
    embedding.byteOffset,
    embedding.byteLength,
  );
  saveEmbedding(memoId, buf);
}

export function deleteEmbeddingCache(memoId: number): void {
  cache.delete(memoId);
  deleteEmbedding(memoId);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0; // 向量点积
  let normA = 0; // 向量 a 的模的平方
  let normB = 0; // 向量 b 的模的平方
  const len = a.length;

  for (let i = 0; i < len; i++) {
    const va = a[i]!; // 向量 a 的第 i 维
    const vb = b[i]!; // 向量 b 的第 i 维
    dotProduct += va * vb; // 累加点积：Σ(ai × bi)
    normA += va * va; // 累加 a 模的平方：Σ(ai²)
    normB += vb * vb; // 累加 b 模的平方：Σ(bi²)
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

  const config = getAppConfig();
  const scored: Array<{ id: number; score: number }> = [];

  for (const [id, emb] of cache) {
    const score = cosineSimilarity(queryEmbedding, emb);
    if (score >= config.embeddings.similarityThreshold) {
      scored.push({ id, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Step 1: Embedding-based recall (get more candidates for reranking)
  const candidateTopN = config.rerank.enabled
    ? Math.max(config.rerank.candidateTopN, limit)
    : limit;
  const candidates = scored.slice(0, candidateTopN);

  // Step 2: Rerank with qwen3-rerank if enabled and multiple candidates
  if (config.rerank.enabled && candidates.length > 1) {
    try {
      const candidateIds = candidates.map((c) => c.id);
      const memos = getMemos({ includePrivate: true, ids: candidateIds });
      const docMap = new Map(memos.map((m) => [m.id, m.content]));

      // Preserve embedding order for consistent doc indexing
      const documents = candidateIds
        .map((id) => ({ id, text: docMap.get(id) || "" }))
        .filter((d) => d.text.length > 0);

      if (documents.length > 1) {
        const reranked = await rerankDocuments(
          query,
          documents,
          config.rerank.finalTopN,
        );
        if (reranked.length > 0) {
          console.log(
            `Rerank: ${candidates.length} candidates → ${reranked.length} results`,
          );
          return reranked.map((r) => r.id);
        }
      }
    } catch (err) {
      console.warn("Rerank failed, falling back to embedding ordering:", err);
    }
  }

  // Fallback: use original embedding-based ordering
  return candidates.slice(0, limit).map((s) => s.id);
}

export async function getSimilarMemoIds(
  memoId: number,
  limit = 5,
): Promise<number[]> {
  const targetEmb = cache.get(memoId);
  if (!targetEmb) return [];

  const config = getAppConfig();
  const scored: Array<{ id: number; score: number }> = [];
  for (const [id, emb] of cache) {
    if (id === memoId) continue;
    const score = cosineSimilarity(targetEmb, emb);
    if (score >= config.embeddings.similarityThreshold) {
      scored.push({ id, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Step 1: Embedding-based recall (get more candidates for reranking)
  const candidateTopN = config.rerank.enabled
    ? Math.max(config.rerank.candidateTopN, limit)
    : limit;
  const candidates = scored.slice(0, candidateTopN);

  // Step 2: Rerank with qwen3-rerank if enabled and multiple candidates
  if (config.rerank.enabled && candidates.length > 1) {
    try {
      // Get source memo content as the rerank query
      const sourceIds = [memoId, ...candidates.map((c) => c.id)];
      const memos = getMemos({ includePrivate: true, ids: sourceIds });
      const docMap = new Map(memos.map((m) => [m.id, m.content]));

      const sourceContent = docMap.get(memoId) || "";
      const candidateIds = candidates.map((c) => c.id);
      const documents = candidateIds
        .map((id) => ({ id, text: docMap.get(id) || "" }))
        .filter((d) => d.text.length > 0);

      if (sourceContent && documents.length > 1) {
        const reranked = await rerankDocuments(
          sourceContent,
          documents,
          config.rerank.finalTopN,
        );
        if (reranked.length > 0) {
          console.log(
            `Rerank (similar): ${candidates.length} candidates → ${reranked.length} results`,
          );
          return reranked.map((r) => r.id);
        }
      }
    } catch (err) {
      console.warn("Rerank failed, falling back to embedding ordering:", err);
    }
  }

  // Fallback: use original embedding-based ordering
  return candidates.slice(0, limit).map((s) => s.id);
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
