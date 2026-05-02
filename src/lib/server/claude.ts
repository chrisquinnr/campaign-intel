import Anthropic from '@anthropic-ai/sdk';
import { dev } from '$app/environment';
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from '$env/static/private';

const DEFAULT_MODELS = [
  'claude-sonnet-4-6',
] as const;

function buildClient(): Anthropic | null {
  if (!ANTHROPIC_API_KEY) {
    return null;
  }
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

function extractAnthropicMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isLowCreditError(error: unknown): boolean {
  const message = extractAnthropicMessage(error).toLowerCase();
  return message.includes('credit balance is too low') || message.includes('plans & billing');
}

function isModelNotFoundError(error: unknown): boolean {
  const message = extractAnthropicMessage(error).toLowerCase();
  return message.includes('not_found_error') && message.includes('model:');
}

function modelCandidates(): string[] {
  const userModel = ANTHROPIC_MODEL?.trim();
  if (userModel) {
    return [userModel, ...DEFAULT_MODELS.filter((m) => m !== userModel)];
  }
  return [...DEFAULT_MODELS];
}

export async function callClaudeText(args: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const client = buildClient();
  if (!client) {
    return `MOCK RESPONSE (missing ANTHROPIC_API_KEY): ${args.prompt.slice(0, 120)}...`;
  }

  let lastError: unknown = null;
  for (const model of modelCandidates()) {
    try {
      const response = await client.messages.create({
        model,
        system: args.system,
        max_tokens: args.maxTokens ?? 700,
        temperature: args.temperature ?? 0.3,
        messages: [
          {
            role: 'user',
            content: args.prompt
          }
        ]
      });

      return response.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim();
    } catch (error) {
      lastError = error;
      if (dev && isLowCreditError(error)) {
        return `MOCK RESPONSE (Anthropic billing unavailable in dev): ${args.prompt.slice(0, 120)}...`;
      }

      // Try the next candidate when this model is unavailable in the workspace.
      if (isModelNotFoundError(error)) {
        continue;
      }

      throw new Error(`Anthropic text call failed: ${extractAnthropicMessage(error)}`);
    }
  }

  throw new Error(`Anthropic text call failed: ${extractAnthropicMessage(lastError)}`);
}

export async function callClaudeTooling(
  payload: Anthropic.Messages.MessageCreateParamsNonStreaming
): Promise<Anthropic.Messages.Message> {
  const client = buildClient();
  if (!client) {
    throw new Error('ANTHROPIC_API_KEY missing. Tool execution requires a real Claude connection.');
  }

  let lastError: unknown = null;
  for (const model of modelCandidates()) {
    try {
      return await client.messages.create({
        ...payload,
        model
      });
    } catch (error) {
      lastError = error;
      if (isModelNotFoundError(error)) {
        continue;
      }
      throw new Error(`Anthropic tooling call failed: ${extractAnthropicMessage(error)}`);
    }
  }

  throw new Error(`Anthropic tooling call failed: ${extractAnthropicMessage(lastError)}`);
}
