import type { AppConfig } from '../config.js';
import type { ChatMessage, InferOptions, InferenceProvider } from './provider.js';

/**
 * OpenAI 兼容实现：本机 Ollama / 云端 vLLM / DeepSeek 通用。
 * 注意：Qwen3 thinking 模式在 Ollama 用 think:false 关闭（决策 10：人设走 non-thinking）。
 */
export class OpenAiCompatibleProvider implements InferenceProvider {
  constructor(private cfg: AppConfig) {}

  async chat(messages: ChatMessage[], opts: InferOptions = {}): Promise<string> {
    const body: Record<string, unknown> = {
      model: opts.model ?? this.cfg.llmModel,
      messages,
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens ?? 512,
      stream: false,
      think: false,
    };
    const res = await fetch(`${this.cfg.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.cfg.llmApiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`inference ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices: { message: { content: string; reasoning?: string } }[];
    };
    const content = data.choices[0]?.message?.content ?? '';
    // 兜底剥离  块（部分端点 think:false 不生效时仍会带）
    return content.replace(/[\s\S]*?<\/think>\s*/g, '').trim();
  }
}
