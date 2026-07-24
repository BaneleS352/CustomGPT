export type ProviderKind = "openai" | "anthropic" | "gemini" | "ollama";

export type Provider = {
  id: number;
  name: string;
  kind: ProviderKind;
  base_url: string;
  api_key_env: string;
  default_model: string;
  enabled: boolean;
};

export type KnowledgeFile = {
  id?: number | null;
  name: string;
  content: string;
};

export type GPT = {
  id: number;
  name: string;
  description: string;
  avatar: string;
  instructions: string;
  knowledge: string;
  enabled: boolean;
  provider_id: number | null;
  model_id: string;
  temperature: number;
  max_output_tokens: number;
  provider?: Provider | null;
  knowledge_files?: KnowledgeFile[];
  chunk_count?: number;
};

export type Message = {
  id: number;
  chat_id: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export type Chat = {
  id: number;
  gpt_id: number;
  title: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
};
