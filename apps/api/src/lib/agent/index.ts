// Agent system - agentic reasoning with tool use
// Implements multi-step reasoning to answer complex questions about code

import Anthropic from '@anthropic-ai/sdk';
import type {
  AgentOptions,
  AgentResult,
  AgentStep,
  AgentEvent,
  ToolCall,
} from './types';
import { AGENT_TOOLS, executeTool, setRepoBasePath } from './tools';
import { getLLMConfig } from '../llm';
import { logger } from '../logger';

export type { AgentOptions, AgentResult, AgentStep, AgentEvent } from './types';
export { AGENT_TOOLS } from './tools';

const DEFAULT_MAX_STEPS = 10;

const AGENT_SYSTEM_PROMPT = `You are a senior software engineer analyzing a codebase. Your task is to answer questions thoroughly and accurately by exploring the code using the available tools.

GUIDELINES:
1. START by using search_code to find relevant code. Be specific in your queries.
2. When you find relevant files, use read_file to get more context if needed.
3. Use list_directory to understand project structure when helpful.
4. Use find_symbol to locate specific function/class definitions.
5. Use get_file_dependencies to understand how files connect.

IMPORTANT:
- Always cite specific files and line numbers in your answers.
- If you're unsure, search more rather than guessing.
- Don't make up information - only report what you find in the code.
- Be thorough but efficient - don't search unnecessarily.
- When you have enough information, provide a clear, well-structured answer.

RESPONSE FORMAT:
- Provide your final answer in clear, structured markdown.
- Include code snippets when relevant.
- Always cite file paths and line numbers.
- If the question cannot be fully answered from the code, say so.`;

interface AgentState {
  messages: Anthropic.MessageParam[];
  steps: AgentStep[];
  filesAccessed: Set<string>;
  searchesPerformed: number;
  totalTokensUsed: number;
}

// convert our tool format to Anthropic format
function getAnthropicTools(): Anthropic.Tool[] {
  return AGENT_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
  }));
}

// run agent (non-streaming)
export async function runAgent(
  query: string,
  options: AgentOptions = {}
): Promise<AgentResult> {
  const { repositoryId, maxSteps = DEFAULT_MAX_STEPS } = options;

  // set repo base path for file access
  if (repositoryId) {
    const repoPath = process.cwd() + '/.nexu/repos/' + repositoryId.replace('/', '/');
    setRepoBasePath(repoPath);
  }

  const config = getLLMConfig();
  if (config.provider !== 'anthropic') {
    throw new Error('Agent mode currently requires Anthropic provider');
  }

  const client = new Anthropic({ apiKey: config.apiKey });

  const state: AgentState = {
    messages: [{ role: 'user', content: query }],
    steps: [],
    filesAccessed: new Set(),
    searchesPerformed: 0,
    totalTokensUsed: 0,
  };

  let currentStep = 0;

  while (currentStep < maxSteps) {
    currentStep++;

    logger.info('Agent step', { step: currentStep, maxSteps });

    // call Claude with tools
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system: AGENT_SYSTEM_PROMPT,
      tools: getAnthropicTools(),
      messages: state.messages,
    });

    state.totalTokensUsed += response.usage.input_tokens + response.usage.output_tokens;

    // process response
    const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
    let textContent = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolUseBlocks.push(block);
      }
    }

    // if there's text and no tool use, we're done
    if (response.stop_reason === 'end_turn' && toolUseBlocks.length === 0) {
      state.steps.push({
        type: 'response',
        content: textContent,
        timestamp: Date.now(),
      });

      return {
        answer: textContent,
        steps: state.steps,
        totalTokensUsed: state.totalTokensUsed,
        filesAccessed: Array.from(state.filesAccessed),
        searchesPerformed: state.searchesPerformed,
      };
    }

    // add thinking if present
    if (textContent) {
      state.steps.push({
        type: 'thinking',
        content: textContent,
        timestamp: Date.now(),
      });
    }

    // execute tools
    if (toolUseBlocks.length > 0) {
      // add assistant message with tool use
      state.messages.push({
        role: 'assistant',
        content: response.content,
      });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolCall: ToolCall = {
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
        };

        // track stats
        if (toolUse.name === 'search_code') {
          state.searchesPerformed++;
        } else if (toolUse.name === 'read_file') {
          state.filesAccessed.add((toolUse.input as { filepath: string }).filepath);
        }

        state.steps.push({
          type: 'tool_call',
          content: `${toolUse.name}(${JSON.stringify(toolUse.input)})`,
          toolCall,
          timestamp: Date.now(),
        });

        // execute tool
        const result = await executeTool(toolCall, repositoryId);

        state.steps.push({
          type: 'tool_result',
          content: result.content.slice(0, 500) + (result.content.length > 500 ? '...' : ''),
          toolResult: result,
          timestamp: Date.now(),
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.isError,
        });
      }

      // add tool results
      state.messages.push({
        role: 'user',
        content: toolResults,
      });
    }
  }

  // max steps reached - ask for final answer
  state.messages.push({
    role: 'user',
    content: 'You have reached the maximum number of steps. Please provide your best answer based on what you have found so far.',
  });

  const finalResponse = await client.messages.create({
    model: config.model,
    max_tokens: 4096,
    system: AGENT_SYSTEM_PROMPT,
    messages: state.messages,
  });

  state.totalTokensUsed += finalResponse.usage.input_tokens + finalResponse.usage.output_tokens;

  const finalText = finalResponse.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  state.steps.push({
    type: 'response',
    content: finalText,
    timestamp: Date.now(),
  });

  return {
    answer: finalText,
    steps: state.steps,
    totalTokensUsed: state.totalTokensUsed,
    filesAccessed: Array.from(state.filesAccessed),
    searchesPerformed: state.searchesPerformed,
  };
}

// run agent with streaming
export async function* runAgentStream(
  query: string,
  options: AgentOptions = {}
): AsyncIterable<AgentEvent> {
  const { repositoryId, maxSteps = DEFAULT_MAX_STEPS } = options;

  // set repo base path for file access
  if (repositoryId) {
    const repoPath = process.cwd() + '/.nexu/repos/' + repositoryId.replace('/', '/');
    setRepoBasePath(repoPath);
  }

  const config = getLLMConfig();
  if (config.provider !== 'anthropic') {
    yield { type: 'error', message: 'Agent mode currently requires Anthropic provider' };
    return;
  }

  const client = new Anthropic({ apiKey: config.apiKey });

  const state: AgentState = {
    messages: [{ role: 'user', content: query }],
    steps: [],
    filesAccessed: new Set(),
    searchesPerformed: 0,
    totalTokensUsed: 0,
  };

  let currentStep = 0;

  while (currentStep < maxSteps) {
    currentStep++;

    // stream Claude response
    const stream = client.messages.stream({
      model: config.model,
      max_tokens: 4096,
      system: AGENT_SYSTEM_PROMPT,
      tools: getAnthropicTools(),
      messages: state.messages,
    });

    let textContent = '';
    const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
    let currentToolUse: Partial<Anthropic.ToolUseBlock> | null = null;
    let inputJson = '';

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'text') {
          // text block starting
        } else if (event.content_block.type === 'tool_use') {
          currentToolUse = {
            type: 'tool_use',
            id: event.content_block.id,
            name: event.content_block.name,
          };
          inputJson = '';
          yield {
            type: 'tool_call',
            tool: event.content_block.name,
            input: {},
          };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          textContent += event.delta.text;
          yield { type: 'text', content: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          inputJson += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolUse && currentToolUse.name) {
          try {
            currentToolUse.input = JSON.parse(inputJson || '{}');
          } catch {
            currentToolUse.input = {};
          }
          toolUseBlocks.push(currentToolUse as Anthropic.ToolUseBlock);
          currentToolUse = null;
        }
      } else if (event.type === 'message_delta') {
        state.totalTokensUsed += event.usage?.output_tokens || 0;
      }
    }

    const finalMessage = await stream.finalMessage();
    state.totalTokensUsed += finalMessage.usage.input_tokens;

    // if end_turn with no tools, we're done
    if (finalMessage.stop_reason === 'end_turn' && toolUseBlocks.length === 0) {
      state.steps.push({
        type: 'response',
        content: textContent,
        timestamp: Date.now(),
      });

      yield {
        type: 'done',
        result: {
          answer: textContent,
          steps: state.steps,
          totalTokensUsed: state.totalTokensUsed,
          filesAccessed: Array.from(state.filesAccessed),
          searchesPerformed: state.searchesPerformed,
        },
      };
      return;
    }

    // record thinking
    if (textContent) {
      state.steps.push({
        type: 'thinking',
        content: textContent,
        timestamp: Date.now(),
      });
    }

    // execute tools
    if (toolUseBlocks.length > 0) {
      state.messages.push({
        role: 'assistant',
        content: finalMessage.content,
      });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolCall: ToolCall = {
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
        };

        // track stats
        if (toolUse.name === 'search_code') {
          state.searchesPerformed++;
        } else if (toolUse.name === 'read_file') {
          state.filesAccessed.add((toolUse.input as { filepath: string }).filepath);
        }

        state.steps.push({
          type: 'tool_call',
          content: `${toolUse.name}(${JSON.stringify(toolUse.input)})`,
          toolCall,
          timestamp: Date.now(),
        });

        // execute tool
        const result = await executeTool(toolCall, repositoryId);

        yield {
          type: 'tool_result',
          tool: toolUse.name,
          result: result.content.slice(0, 200) + (result.content.length > 200 ? '...' : ''),
          isError: result.isError,
        };

        state.steps.push({
          type: 'tool_result',
          content: result.content.slice(0, 500) + (result.content.length > 500 ? '...' : ''),
          toolResult: result,
          timestamp: Date.now(),
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.isError,
        });
      }

      state.messages.push({
        role: 'user',
        content: toolResults,
      });
    }
  }

  // max steps reached
  state.messages.push({
    role: 'user',
    content: 'Maximum steps reached. Please provide your final answer now.',
  });

  const finalStream = client.messages.stream({
    model: config.model,
    max_tokens: 4096,
    system: AGENT_SYSTEM_PROMPT,
    messages: state.messages,
  });

  let finalText = '';
  for await (const event of finalStream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      finalText += event.delta.text;
      yield { type: 'text', content: event.delta.text };
    }
  }

  const finalMessage = await finalStream.finalMessage();
  state.totalTokensUsed += finalMessage.usage.input_tokens + finalMessage.usage.output_tokens;

  state.steps.push({
    type: 'response',
    content: finalText,
    timestamp: Date.now(),
  });

  yield {
    type: 'done',
    result: {
      answer: finalText,
      steps: state.steps,
      totalTokensUsed: state.totalTokensUsed,
      filesAccessed: Array.from(state.filesAccessed),
      searchesPerformed: state.searchesPerformed,
    },
  };
}
