/**
 * Type definitions for Anthropic to Gemini API conversion
 */

// Anthropic API Types
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContent[];
}

export interface AnthropicContent {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  tool_use_id?: string;
  name?: string;
  input?: Record<string, any>;
  content?: string | AnthropicContent[];
  is_error?: boolean;
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  system?: string;
  tools?: AnthropicTool[];
  tool_choice?: 'auto' | 'any' | { type: 'tool'; name: string };
  stop_sequences?: string[];
  stream?: boolean;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContent[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicStreamChunk {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop' | 'error';
  message?: Partial<AnthropicResponse>;
  index?: number;
  content_block?: AnthropicContent;
  delta?: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
  usage?: {
    output_tokens: number;
  };
}

// Gemini API Types
export interface GeminiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GeminiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface GeminiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface GeminiRequest {
  model: string;
  messages: GeminiMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: GeminiTool[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
  stop?: string[];
  stream?: boolean;
}

export interface GeminiChoice {
  index: number;
  message?: {
    role: 'assistant';
    content: string | null;
    tool_calls?: GeminiToolCall[];
  };
  delta?: {
    role?: 'assistant';
    content?: string;
    tool_calls?: GeminiToolCall[];
  };
  finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

export interface GeminiResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: GeminiChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    type: string;
    message: string;
  };
}

export interface GeminiStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: GeminiChoice[];
}

// MCP Types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// Environment Types
export interface Env {
  GEMINI_API_KEY: string;
}

// Error Types
export interface ApiError {
  type: string;
  message: string;
}

export interface ErrorResponse {
  type: 'error';
  error: ApiError;
}

// Model Mapping Types
export type ClaudeModel = string;
export type GeminiModel = string;

export interface ModelMapping {
  [key: ClaudeModel]: GeminiModel;
}

// Conversion Result Types
export interface ConversionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}