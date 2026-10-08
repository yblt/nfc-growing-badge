// 推理适配层（约定 2）：InferenceProvider 接口，开发期一个 OpenAI 兼容实现
// M2 加 vLLM 多 LoRA 时新增实现类，chat 链路代码不动

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface InferenceProvider {
  chat(messages: ChatMessage[], opts?: InferOptions): Promise<string>;
}
