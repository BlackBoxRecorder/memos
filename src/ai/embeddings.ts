// Embedding cache & semantic search engine
// Pure in-memory cosine similarity, no SQLite extensions needed

import { getAllEmbeddings, saveEmbedding, deleteEmbedding } from "../db";
import { generateEmbedding, isAiAvailable } from "./service";

const SIMILARITY_THRESHOLD = 0.3;

// In-memory cache: memo_id → Float32Array
const cache = new Map<number, Float32Array>();

export function initEmbeddingCache(): void {
  if (!isAiAvailable().embedding) return;

  const rows = getAllEmbeddings();
  for (const row of rows) {
    try {
      if (row.embedding) {
        // Buffer to Float32Array
        const arr = new Float32Array(
          row.embedding.buffer.slice(
            row.embedding.byteOffset,
            row.embedding.byteOffset + row.embedding.byteLength,
          ),
        );
        cache.set(row.memo_id, arr);
      }
    } catch {
      // skip corrupt entries
    }
  }
  if (cache.size > 0) {
    console.log(`Loaded ${cache.size} embeddings into cache`);
  }
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
    if (score >= SIMILARITY_THRESHOLD) {
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
