export interface AiGenerateRequest {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs?: number;
}

export interface AiModelClient {
  generate(request: AiGenerateRequest): Promise<string>;
}
