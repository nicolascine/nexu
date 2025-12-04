// Agent system types - tool use and agentic reasoning

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface AgentStep {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response';
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: number;
}

export interface AgentContext {
  repositoryId?: string;
  maxSteps: number;
  currentStep: number;
  steps: AgentStep[];
  totalTokensUsed: number;
}

export interface AgentOptions {
  repositoryId?: string;
  maxSteps?: number;
  stream?: boolean;
}

export interface AgentResult {
  answer: string;
  steps: AgentStep[];
  totalTokensUsed: number;
  filesAccessed: string[];
  searchesPerformed: number;
}

// streaming events
export type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: string; isError?: boolean }
  | { type: 'text'; content: string }
  | { type: 'done'; result: AgentResult }
  | { type: 'error'; message: string };
