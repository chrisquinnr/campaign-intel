import { exec as nodeExec } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { callClaudeTooling } from '$lib/server/claude';
import { executionTools } from '$lib/server/tools';

const exec = promisify(nodeExec);
const ROOT = process.cwd();

function safePath(inputPath: string): string {
  const resolved = resolve(ROOT, inputPath);
  if (!resolved.startsWith(ROOT)) {
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }
  return resolved;
}

async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  if (name === 'run_command') {
    const command = String(input.command ?? '');
    const cwd = input.cwd ? safePath(String(input.cwd)) : ROOT;
    const { stdout, stderr } = await exec(command, { cwd, timeout: 30000 });
    return [stdout, stderr].filter(Boolean).join('\n').trim() || '[no output]';
  }

  if (name === 'read_file') {
    const path = safePath(String(input.path ?? ''));
    return await readFile(path, 'utf8');
  }

  if (name === 'write_file') {
    const path = safePath(String(input.path ?? ''));
    const content = String(input.content ?? '');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
    return `Wrote ${content.length} bytes to ${path}`;
  }

  throw new Error(`Unknown tool: ${name}`);
}

export async function executeWithClaude(payload: {
  question: string;
  consensusSummary: string;
  agentAnswers: string[];
}): Promise<string> {
  let messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
    {
      role: 'user',
      content:
        `You are an execution agent for MAGI. Decide whether to use tools.\n` +
        `Question: ${payload.question}\n` +
        `Consensus Summary: ${payload.consensusSummary}\n` +
        `Agent Answers:\n${payload.agentAnswers.join('\n\n')}`
    }
  ];

  for (let round = 0; round < 4; round += 1) {
    const msg = await callClaudeTooling({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      tools: executionTools as unknown as any[],
      messages: messages as any[]
    });

    const toolUses = msg.content.filter((c: any) => c.type === 'tool_use');
    const texts = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');

    if (!toolUses.length) {
      return texts || 'Execution completed with no explicit output.';
    }

    messages.push({ role: 'assistant', content: msg.content as any });

    const toolResults = [];
    for (const t of toolUses as any[]) {
      try {
        const result = await runTool(t.name, t.input);
        toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: result });
      } catch (error) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: t.id,
          content: `Tool failed: ${error instanceof Error ? error.message : String(error)}`,
          is_error: true
        });
      }
    }

    messages.push({ role: 'user', content: toolResults as any });
  }

  return 'Execution loop finished without terminal summary.';
}
