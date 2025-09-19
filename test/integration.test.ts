import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest';
import { AnthropicRequest, GeminiResponse, Env } from '../src/types';

describe('Integration Tests', () => {
  const mockEnv: Env = {
    GEMINI_API_KEY: 'test-api-key'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as MockedFunction<typeof fetch>).mockClear();
  });

  it('should handle successful non-streaming request', async () => {
    // Mock successful Gemini API response
    const mockGeminiResponse: GeminiResponse = {
      id: 'resp_123',
      object: 'chat.completion',
      created: Date.now(),
      model: 'google/gemini-2.5-flash',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you today?'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 8,
        total_tokens: 18
      }
    };

    (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce(
      new Response(JSON.stringify(mockGeminiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const worker = (await import('../src/worker')).default;
    
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Hello!' }
      ],
      max_tokens: 100
    };

    const request = new Request('https://example.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-key',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicRequest)
    });

    const response = await worker.fetch(request, mockEnv, {} as ExecutionContext);
    
    expect(response.status).toBe(200);
    
    const responseData = await response.json() as any;
    expect(responseData.type).toBe('message');
    expect(responseData.role).toBe('assistant');
    expect(responseData.content).toHaveLength(1);
    expect(responseData.content[0].type).toBe('text');
    expect(responseData.content[0].text).toBe('Hello! How can I help you today?');
    expect(responseData.model).toBe('claude-3-sonnet');
    expect(responseData.stop_reason).toBe('end_turn');
    expect(responseData.usage.input_tokens).toBe(10);
    expect(responseData.usage.output_tokens).toBe(8);

    // Verify the request was made to Gemini API
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.aimlapi.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json'
        })
      })
    );
  });

  it('should handle requests with tools and function calls', async () => {
    // Mock Gemini response with tool calls
    const mockGeminiResponse: GeminiResponse = {
      id: 'resp_123',
      object: 'chat.completion',
      created: Date.now(),
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
                  arguments: '{"operation":"add","a":2,"b":3}'
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }
      ],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 20,
        total_tokens: 70
      }
    };

    (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce(
      new Response(JSON.stringify(mockGeminiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const worker = (await import('../src/worker')).default;
    
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'What is 2 + 3?' }
      ],
      tools: [
        {
          name: 'calculator',
          description: 'Perform basic arithmetic operations',
          input_schema: {
            type: 'object',
            properties: {
              operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
              a: { type: 'number' },
              b: { type: 'number' }
            },
            required: ['operation', 'a', 'b']
          }
        }
      ],
      tool_choice: 'auto',
      max_tokens: 100
    };

    const request = new Request('https://example.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-key',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicRequest)
    });

    const response = await worker.fetch(request, mockEnv, {} as ExecutionContext);
    
    expect(response.status).toBe(200);
    
    const responseData = await response.json() as any;
    expect(responseData.type).toBe('message');
    expect(responseData.role).toBe('assistant');
    expect(responseData.content).toHaveLength(1);
    expect(responseData.content[0].type).toBe('tool_use');
    expect(responseData.content[0].tool_use_id).toBe('call_123');
    expect(responseData.content[0].name).toBe('calculator');
    expect(responseData.content[0].input).toEqual({
      operation: 'add',
      a: 2,
      b: 3
    });
    expect(responseData.stop_reason).toBe('tool_use');
  });

  it('should handle streaming responses', async () => {
    // Mock streaming response
    const streamData = [
      'data: {"id":"chunk_1","object":"chat.completion.chunk","created":1234567890,"model":"google/gemini-2.5-flash","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n',
      'data: {"id":"chunk_2","object":"chat.completion.chunk","created":1234567890,"model":"google/gemini-2.5-flash","choices":[{"index":0,"delta":{"content":" there"}}]}\n\n',
      'data: {"id":"chunk_3","object":"chat.completion.chunk","created":1234567890,"model":"google/gemini-2.5-flash","choices":[{"index":0,"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n'
    ];

    const mockStream = new ReadableStream({
      start(controller) {
        streamData.forEach(chunk => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      }
    });

    (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce(
      new Response(mockStream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    );

    const worker = (await import('../src/worker')).default;
    
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Hello!' }
      ],
      stream: true,
      max_tokens: 100
    };

    const request = new Request('https://example.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-key',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicRequest)
    });

    const response = await worker.fetch(request, mockEnv, {} as ExecutionContext);
    
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });

  it('should handle Gemini API errors', async () => {
    // Mock Gemini API error response
    (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce(
      new Response(JSON.stringify({
        error: {
          type: 'invalid_request_error',
          message: 'Invalid model specified'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const worker = (await import('../src/worker')).default;
    
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Hello!' }
      ],
      max_tokens: 100
    };

    const request = new Request('https://example.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-key',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicRequest)
    });

    const response = await worker.fetch(request, mockEnv, {} as ExecutionContext);
    
    expect(response.status).toBe(502);
    
    const responseData = await response.json() as any;
    expect(responseData.type).toBe('error');
    expect(responseData.error.type).toBe('api_error');
    expect(responseData.error.message).toContain('Gemini API error: 400');
  });

  it('should handle malformed JSON requests', async () => {
    const worker = (await import('../src/worker')).default;
    
    const request = new Request('https://example.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-key',
        'anthropic-version': '2023-06-01'
      },
      body: 'invalid json'
    });

    const response = await worker.fetch(request, mockEnv, {} as ExecutionContext);
    
    expect(response.status).toBe(400);
    
    const responseData = await response.json() as any;
    expect(responseData.type).toBe('error');
    expect(responseData.error.type).toBe('invalid_request_error');
    expect(responseData.error.message).toBe('Invalid JSON in request body');
  });

  it('should handle requests with system prompts', async () => {
    // Mock successful Gemini API response
    const mockGeminiResponse: GeminiResponse = {
      id: 'resp_123',
      object: 'chat.completion',
      created: Date.now(),
      model: 'google/gemini-2.5-flash',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I am a helpful assistant. Hello!'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 25,
        completion_tokens: 8,
        total_tokens: 33
      }
    };

    (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce(
      new Response(JSON.stringify(mockGeminiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const worker = (await import('../src/worker')).default;
    
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Hello!' }
      ],
      system: 'You are a helpful assistant.',
      max_tokens: 100
    };

    const request = new Request('https://example.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-key',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicRequest)
    });

    const response = await worker.fetch(request, mockEnv, {} as ExecutionContext);
    
    expect(response.status).toBe(200);
    
    // Verify the request sent to Gemini included the system message
    const geminiRequestCall = (global.fetch as MockedFunction<typeof fetch>).mock.calls[0];
    const geminiRequestBody = JSON.parse(geminiRequestCall[1]?.body as string);
    
    expect(geminiRequestBody.messages).toHaveLength(2);
    expect(geminiRequestBody.messages[0].role).toBe('system');
    expect(geminiRequestBody.messages[0].content).toBe('You are a helpful assistant.');
    expect(geminiRequestBody.messages[1].role).toBe('user');
    expect(geminiRequestBody.messages[1].content).toBe('Hello!');
  });

  it('should handle multimodal content with tool results', async () => {
    // Mock successful Gemini API response
    const mockGeminiResponse: GeminiResponse = {
      id: 'resp_123',
      object: 'chat.completion',
      created: Date.now(),
      model: 'google/gemini-2.5-flash',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'The calculation result is 5.'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 40,
        completion_tokens: 6,
        total_tokens: 46
      }
    };

    (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce(
      new Response(JSON.stringify(mockGeminiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const worker = (await import('../src/worker')).default;
    
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'What is 2 + 3?' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              tool_use_id: 'tool_123',
              name: 'calculator',
              input: { operation: 'add', a: 2, b: 3 }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_123',
              content: '5'
            }
          ]
        }
      ],
      max_tokens: 100
    };

    const request = new Request('https://example.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-key',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicRequest)
    });

    const response = await worker.fetch(request, mockEnv, {} as ExecutionContext);
    
    expect(response.status).toBe(200);
    
    // Verify the request sent to Gemini properly converted the multimodal content
    const geminiRequestCall = (global.fetch as MockedFunction<typeof fetch>).mock.calls[0];
    const geminiRequestBody = JSON.parse(geminiRequestCall[1]?.body as string);
    
    expect(geminiRequestBody.messages).toHaveLength(3);
    expect(geminiRequestBody.messages[1].content).toContain('[Tool Call: calculator({"operation":"add","a":2,"b":3})]');
    expect(geminiRequestBody.messages[2].content).toContain('[Tool Result: 5]');
  });
});