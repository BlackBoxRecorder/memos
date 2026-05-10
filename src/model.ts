export interface Memo {
  id: number;
  content: string;
  tag: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Prompt {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CreativeItem {
  id: number;
  prompt_id: number;
  extra_prompt: string;
  embedding: Buffer | null;
  content: string;
  context_memo_ids: string;
  created_at: string;
  updated_at: string;
}
