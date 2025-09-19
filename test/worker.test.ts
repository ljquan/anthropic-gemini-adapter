import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest';
import {
  getGeminiModel,
  validateAnthropicRequest,
  convertAnthropicToGemini,
  convertGeminiToAnthropic,
  convertAnthropicMessage,
  convertAnthropicToolsToGemini,
  convertAnthropicToolChoice,
  convertGeminiStreamChunk,
  createErrorResponse
} from '../src/worker';
import {
  AnthropicRequest,
  AnthropicMessage,
  AnthropicTool,
  GeminiResponse,
  GeminiStreamChunk,
  Env
} from '../src/types';

describe('Model Mapping', () => {
  it('should map known Claude models correctly', () => {
    expect(getGeminiModel('claude-3-sonnet')).toBe('google/gemini-2.5-flash');
    expect(getGeminiModel('claude-3-opus')).toBe('google/gemini-2.5-pro');
    expect(getGeminiModel('claude-3-haiku')).toBe('google/gemini-2.5-flash-lite');
    expect(getGeminiModel('claude-3.5-sonnet-20240620')).toBe('google/gemini-2.5-flash');
  });

  it('should handle pattern-based fallback mapping', () => {
    expect(getGeminiModel('claude-unknown-opus')).toBe('google/gemini-2.5-pro');
    expect(getGeminiModel('claude-unknown-sonnet')).toBe('google/gemini-2.5-flash');
    expect(getGeminiModel('claude-unknown-haiku')).toBe('google/gemini-2.5-flash-lite');
  });

  it('should use default fallback for unknown models', () => {
    expect(getGeminiModel('unknown-model')).toBe('google/gemini-2.5-flash');
    expect(getGeminiModel('')).toBe('google/gemini-2.5-flash');
  });
});

describe('Request Validation', () => {
  it('should validate valid requests', () => {
    const validRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Hello' }]
    };
    
    const result = validateAnthropicRequest(validRequest);
    expect(result.success).toBe(true);
  });

  it('should reject requests without model', () => {
    const invalidRequest = {
      messages: [{ role: 'user', content: 'Hello' }]
    } as AnthropicRequest;
    
    const result = validateAnthropicRequest(invalidRequest);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing required field: model');
  });

  it('should reject requests without messages', () => {
    const invalidRequest = {
      model: 'claude-3-sonnet'
    } as AnthropicRequest;
    
    const result = validateAnthropicRequest(invalidRequest);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing or invalid messages field');
  });

  it('should reject requests with empty messages array', () => {
    const invalidRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: []
    };
    
    const result = validateAnthropicRequest(invalidRequest);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Messages array cannot be empty');
  });
});

describe('Message Conversion', () => {
  it('should convert simple text messages', () => {
    const message: AnthropicMessage = {
      role: 'user',
      content: 'Hello, world!'
    };
    
    const result = convertAnthropicMessage(message, 0);
    expect(result).toEqual({
      role: 'user',
      content: 'Hello, world!'
    });
  });

  it('should convert assistant messages', () => {
    const message: AnthropicMessage = {
      role: 'assistant',
      content: 'Hello back!'
    };
    
    const result = convertAnthropicMessage(message, 0);
    expect(result).toEqual({
      role: 'assistant',
      content: 'Hello back!'
    });
  });

  it('should handle multimodal content with text', () => {
    const message: AnthropicMessage = {
      role: 'user',
      content: [
        { type: 'text', text: 'First part' },
        { type: 'text', text: 'Second part' }
      ]
    };
    
    const result = convertAnthropicMessage(message, 0);
    expect(result).toEqual({
      role: 'user',
      content: 'First part\nSecond part'
    });
  });

  it('should handle tool use content', () => {
    const message: AnthropicMessage = {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          tool_use_id: 'tool_123',
          name: 'calculator',
          input: { operation: 'add', a: 1, b: 2 }
        }
      ]
    };
    
    const result = convertAnthropicMessage(message, 0);
    expect(result?.content).toContain('[Tool Call: calculator({"operation":"add","a":1,"b":2})]');
  });

  it('should handle tool result content', () => {
    const message: AnthropicMessage = {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool_123',
          content: 'Result: 3'
        }
      ]
    };
    
    const result = convertAnthropicMessage(message, 0);
    expect(result?.content).toContain('[Tool Result: Result: 3]');
  });

  it('should return null for empty content', () => {
    const message: AnthropicMessage = {
      role: 'user',
      content: ''
    };
    
    const result = convertAnthropicMessage(message, 0);
    expect(result).toBeNull();
  });
});

describe('Tool Conversion', () => {
  it('should convert Anthropic tools to Gemini format', () => {
    const tools: AnthropicTool[] = [
      {
        name: 'calculator',
        description: 'A simple calculator',
        input_schema: {
          type: 'object',
          properties: {
            operation: { type: 'string' },
            a: { type: 'number' },
            b: { type: 'number' }
          },
          required: ['operation', 'a', 'b']
        }
      }
    ];
    
    const result = convertAnthropicToolsToGemini(tools);
    expect(result).toEqual([
      {
        type: 'function',
        function: {
          name: 'calculator',
          description: 'A simple calculator',
          parameters: {
            type: 'object',
            properties: {
              operation: { type: 'string' },
              a: { type: 'number' },
              b: { type: 'number' }
            },
            required: ['operation', 'a', 'b']
          }
        }
      }
    ]);
  });

  it('should convert tool choice options', () => {
    expect(convertAnthropicToolChoice('auto')).toBe('auto');
    expect(convertAnthropicToolChoice('any')).toBe('auto');
    expect(convertAnthropicToolChoice({ type: 'tool', name: 'calculator' })).toEqual({
      type: 'function',
      function: { name: 'calculator' }
    });
    expect(convertAnthropicToolChoice(undefined)).toBeUndefined();
  });
});

describe('Request Conversion', () => {
  it('should convert basic Anthropic request to Gemini format', () => {
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Hello!' }
      ],
      max_tokens: 100,
      temperature: 0.7
    };
    
    const result = convertAnthropicToGemini(anthropicRequest);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'user', content: 'Hello!' }
      ],
      max_tokens: 100,
      temperature: 0.7
    });
  });

  it('should include system message when present', () => {
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Hello!' }
      ],
      system: 'You are a helpful assistant'
    };
    
    const result = convertAnthropicToGemini(anthropicRequest);
    expect(result.success).toBe(true);
    expect(result.data?.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello!' }
    ]);
  });

  it('should convert tools when present', () => {
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Calculate 2+2' }
      ],
      tools: [
        {
          name: 'calculator',
          description: 'A calculator',
          input_schema: {
            type: 'object',
            properties: { operation: { type: 'string' } }
          }
        }
      ],
      tool_choice: 'auto'
    };
    
    const result = convertAnthropicToGemini(anthropicRequest);
    expect(result.success).toBe(true);
    expect(result.data?.tools).toHaveLength(1);
    expect(result.data?.tool_choice).toBe('auto');
  });

  it('should handle optional parameters', () => {
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Hello!' }
      ],
      top_p: 0.9,
      stop_sequences: ['stop1', 'stop2']
    };
    
    const result = convertAnthropicToGemini(anthropicRequest);
    expect(result.success).toBe(true);
    expect(result.data?.top_p).toBe(0.9);
    expect(result.data?.stop).toEqual(['stop1', 'stop2']);
  });
});

describe('Response Conversion', () => {
  it('should convert basic Gemini response to Anthropic format', () => {
    const geminiResponse: GeminiResponse = {
      id: 'resp_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'google/gemini-2.5-flash',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello back!'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      }
    };
    
    const originalRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Hello!' }]
    };
    
    const result = convertGeminiToAnthropic(geminiResponse, originalRequest);
    expect(result.success).toBe(true);
    expect(result.data?.role).toBe('assistant');
    expect(result.data?.content).toEqual([
      { type: 'text', text: 'Hello back!' }
    ]);
    expect(result.data?.stop_reason).toBe('end_turn');
    expect(result.data?.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5
    });
  });

  it('should handle tool calls in response', () => {
    const geminiResponse: GeminiResponse = {
      id: 'resp_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'google/gemini-2.5-flash',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'calculator',
                  arguments: '{"operation":"add","a":1,"b":2}'
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }
      ]
    };
    
    const originalRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Calculate 1+2' }]
    };
    
    const result = convertGeminiToAnthropic(geminiResponse, originalRequest);
    expect(result.success).toBe(true);
    expect(result.data?.content).toEqual([
      {
        type: 'tool_use',
        tool_use_id: 'call_123',
        name: 'calculator',
        input: { operation: 'add', a: 1, b: 2 }
      }
    ]);
    expect(result.data?.stop_reason).toBe('tool_use');
  });

  it('should handle error responses', () => {
    const geminiResponse: GeminiResponse = {
      id: 'resp_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'google/gemini-2.5-flash',
      choices: [],
      error: {
        type: 'invalid_request',
        message: 'Invalid input'
      }
    };
    
    const originalRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Hello!' }]
    };
    
    const result = convertGeminiToAnthropic(geminiResponse, originalRequest);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid input');
  });

  it('should handle missing choices', () => {
    const geminiResponse: GeminiResponse = {
      id: 'resp_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'google/gemini-2.5-flash',
      choices: []
    };
    
    const originalRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Hello!' }]
    };
    
    const result = convertGeminiToAnthropic(geminiResponse, originalRequest);
    expect(result.success).toBe(false);
    expect(result.error).toBe('No response choices from Gemini API');
  });
});

describe('Stream Chunk Conversion', () => {
  it('should convert text delta chunks', () => {
    const geminiChunk: GeminiStreamChunk = {
      id: 'chunk_123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'google/gemini-2.5-flash',
      choices: [
        {
          index: 0,
          delta: {
            content: 'Hello'
          }
        }
      ]
    };
    
    const originalRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Hi' }]
    };
    
    const result = convertGeminiStreamChunk(geminiChunk, originalRequest);
    expect(result).toEqual({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'text_delta',
        text: 'Hello'
      }
    });
  });

  it('should convert tool call chunks', () => {
    const geminiChunk: GeminiStreamChunk = {
      id: 'chunk_123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'google/gemini-2.5-flash',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'calculator',
                  arguments: '{"a":1}'
                }
              }
            ]
          }
        }
      ]
    };
    
    const originalRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Calculate' }]
    };
    
    const result = convertGeminiStreamChunk(geminiChunk, originalRequest);
    expect(result).toEqual({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"a":1}'
      }
    });
  });

  it('should handle finish reason chunks', () => {
    const geminiChunk: GeminiStreamChunk = {
      id: 'chunk_123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'google/gemini-2.5-flash',
      choices: [
        {
          index: 0,
          finish_reason: 'stop'
        }
      ]
    };
    
    const originalRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Hi' }]
    };
    
    const result = convertGeminiStreamChunk(geminiChunk, originalRequest);
    expect(result).toEqual({
      type: 'message_stop'
    });
  });

  it('should return null for empty chunks', () => {
    const geminiChunk: GeminiStreamChunk = {
      id: 'chunk_123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'google/gemini-2.5-flash',
      choices: []
    };
    
    const originalRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Hi' }]
    };
    
    const result = convertGeminiStreamChunk(geminiChunk, originalRequest);
    expect(result).toBeNull();
  });
});

describe('Error Response Creation', () => {
  it('should create proper error responses', () => {
    const response = createErrorResponse('test_error', 'Test message', 400);
    
    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('should default to status 400', () => {
    const response = createErrorResponse('test_error', 'Test message');
    expect(response.status).toBe(400);
  });
});

describe('Integration Tests', () => {
  const mockEnv: Env = {
    GEMINI_API_KEY: 'test-api-key'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as MockedFunction<typeof fetch>).mockClear();
  });

  it('should handle CORS preflight requests', async () => {
    const worker = (await import('../src/worker')).default;
    
    const request = new Request('https://example.com/v1/messages', {
      method: 'OPTIONS'
    });
    
    const response = await worker.fetch(request, mockEnv, {} as ExecutionContext);
    
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('should return 404 for unknown routes', async () => {
    const worker = (await import('../src/worker')).default;
    
    const request = new Request('https://example.com/unknown', {
      method: 'GET'
    });
    
    const response = await worker.fetch(request, mockEnv, {} as ExecutionContext);
    
    expect(response.status).toBe(404);
  });

  it('should return 500 for missing API key', async () => {
    const worker = (await import('../src/worker')).default;
    
    const request = new Request('https://example.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-3-sonnet',
        messages: [{ role: 'user', content: 'Hello' }]
      })
    });
    
    const response = await worker.fetch(request, {}, {} as ExecutionContext);
    
    expect(response.status).toBe(500);
  });
});