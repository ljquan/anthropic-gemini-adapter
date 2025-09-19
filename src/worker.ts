/**
 * Cloudflare Worker to convert Anthropic API calls to Gemini API calls
 * Supports MCP Tools and Function Calls
 */

import {
  AnthropicRequest,
  AnthropicResponse,
  AnthropicMessage,
  AnthropicContent,
  AnthropicTool,
  AnthropicStreamChunk,
  GeminiRequest,
  GeminiResponse,
  GeminiMessage,
  GeminiTool,
  GeminiToolCall,
  GeminiStreamChunk,
  MCPTool,
  Env,
  ErrorResponse,
  ModelMapping,
  ConversionResult
} from './types';

const MODEL_MAPPING: ModelMapping = {
  // Claude 3 Sonnet variants -> Gemini 2.5 Flash
  'claude-3-sonnet': 'google/gemini-2.5-flash',
  'claude-3-sonnet-20240229': 'google/gemini-2.5-flash',
  'claude-3.5-sonnet': 'google/gemini-2.5-flash',
  'claude-3.5-sonnet-20240620': 'google/gemini-2.5-flash',
  'claude-3.5-sonnet-20241022': 'google/gemini-2.5-flash',
  
  // Claude 3 Opus variants -> Gemini 2.5 Pro
  'claude-3-opus': 'google/gemini-2.5-pro',
  'claude-3-opus-20240229': 'google/gemini-2.5-pro',
  
  // Claude 3 Haiku variants -> Gemini 2.5 Flash Lite
  'claude-3-haiku': 'google/gemini-2.5-flash-lite',
  'claude-3-haiku-20240307': 'google/gemini-2.5-flash-lite',
  
  // Claude 4 variants (future-proofing) -> Best available Gemini models
  'claude-4-opus': 'google/gemini-2.5-pro',
  'claude-4-sonnet': 'google/gemini-2.5-flash',
  'claude-4-haiku': 'google/gemini-2.5-flash-lite'
};

function getGeminiModel(claudeModel: string): string {
  // Direct mapping first
  if (MODEL_MAPPING[claudeModel]) {
    return MODEL_MAPPING[claudeModel];
  }
  
  // Pattern-based fallback mapping
  const lowerModel = claudeModel.toLowerCase();
  
  if (lowerModel.includes('opus')) {
    return 'google/gemini-2.5-pro';
  } else if (lowerModel.includes('sonnet')) {
    return 'google/gemini-2.5-flash';
  } else if (lowerModel.includes('haiku')) {
    return 'google/gemini-2.5-flash-lite';
  }
  
  // Default fallback
  return 'google/gemini-2.5-flash';
}

const GEMINI_API_BASE = 'https://api.aimlapi.com/v1/chat/completions';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    try {
      const url = new URL(request.url);
      console.log(`[${new Date().toISOString()}] ${request.method} ${url.pathname}`);
      
      // Validate API key presence
      if (!env.GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY environment variable is not set');
        return createErrorResponse('configuration_error', 'GEMINI_API_KEY not configured', 500);
      }
      
      if (url.pathname === '/v1/messages') {
        const result = await handleAnthropicToGemini(request, env);
        const duration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] Request completed in ${duration}ms`);
        return result;
      }
      
      console.log(`[${new Date().toISOString()}] Route not found: ${url.pathname}`);
      return createErrorResponse('not_found', 'Endpoint not found', 404);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] Unhandled error after ${duration}ms:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResponse('internal_error', errorMessage, 500);
    }
  }
};

function createErrorResponse(type: string, message: string, status = 400): Response {
  const errorResponse: ErrorResponse = {
    type: 'error',
    error: {
      type: type,
      message: message
    }
  };
  
  return new Response(JSON.stringify(errorResponse), {
    status: status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function handleCORS(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version'
    }
  });
}

async function handleAnthropicToGemini(request: Request, env: Env): Promise<Response> {
  let anthropicRequest: AnthropicRequest;
  
  try {
    anthropicRequest = await request.json() as AnthropicRequest;
  } catch (error) {
    console.error('Failed to parse request JSON:', error);
    return createErrorResponse('invalid_request_error', 'Invalid JSON in request body');
  }
  
  // Validate required fields
  const validation = validateAnthropicRequest(anthropicRequest);
  if (!validation.success) {
    return createErrorResponse('invalid_request_error', validation.error || 'Invalid request');
  }
  
  console.log(`Processing request for model: ${anthropicRequest.model}, streaming: ${anthropicRequest.stream}`);
  
  // Check if streaming is requested
  const isStreaming = anthropicRequest.stream === true;
  
  try {
    // Convert Anthropic request to Gemini format
    const conversionResult = convertAnthropicToGemini(anthropicRequest);
    if (!conversionResult.success || !conversionResult.data) {
      return createErrorResponse('conversion_error', conversionResult.error || 'Failed to convert request');
    }
    
    const geminiRequest = conversionResult.data;
    
    // Add streaming parameter if needed
    if (isStreaming) {
      geminiRequest.stream = true;
    }
    
    console.log(`Making request to Gemini API with model: ${geminiRequest.model}`);
    
    // Make request to Gemini API
    const geminiResponse = await fetch(GEMINI_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GEMINI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(geminiRequest)
    });
    
    if (!geminiResponse.ok) {
      console.error(`Gemini API error: ${geminiResponse.status} ${geminiResponse.statusText}`);
      const errorText = await geminiResponse.text();
      console.error('Gemini API error response:', errorText);
      
      return createErrorResponse(
        'api_error', 
        `Gemini API error: ${geminiResponse.status} ${geminiResponse.statusText}`,
        502
      );
    }
    
    if (isStreaming) {
      return handleStreamingResponse(geminiResponse, anthropicRequest);
    } else {
      const geminiData = await geminiResponse.json() as GeminiResponse;
      
      // Convert Gemini response back to Anthropic format
      const responseResult = convertGeminiToAnthropic(geminiData, anthropicRequest);
      if (!responseResult.success || !responseResult.data) {
        return createErrorResponse('conversion_error', responseResult.error || 'Failed to convert response');
      }
      
      console.log('Successfully converted response to Anthropic format');
      
      return new Response(JSON.stringify(responseResult.data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    return createErrorResponse('internal_error', `Processing failed: ${errorMessage}`, 500);
  }
}

function validateAnthropicRequest(request: AnthropicRequest): ConversionResult<void> {
  if (!request.model) {
    return { success: false, error: 'Missing required field: model' };
  }
  
  if (!request.messages || !Array.isArray(request.messages)) {
    return { success: false, error: 'Missing or invalid messages field' };
  }
  
  if (request.messages.length === 0) {
    return { success: false, error: 'Messages array cannot be empty' };
  }
  
  return { success: true };
}

function convertAnthropicToGemini(anthropicRequest: AnthropicRequest): ConversionResult<GeminiRequest> {
  try {
    const { model, messages, max_tokens, temperature, system, tools, tool_choice } = anthropicRequest;
    
    // Map Anthropic model to Gemini model
    const geminiModel = getGeminiModel(model);
    console.log(`Mapped ${model} to ${geminiModel}`);
    
    // Convert messages format
    let geminiMessages: GeminiMessage[] = [];
    
    // Add system message if present
    if (system) {
      geminiMessages.push({
        role: 'system',
        content: system
      });
    }
    
    // Convert messages with proper handling of different content types
    messages.forEach((msg, index) => {
      const convertedMessage = convertAnthropicMessage(msg, index);
      if (convertedMessage) {
        geminiMessages.push(convertedMessage);
      }
    });
  
    const geminiRequest: GeminiRequest = {
      model: geminiModel,
      messages: geminiMessages,
      max_tokens: max_tokens || 1024,
      temperature: temperature !== undefined ? temperature : 0.7
    };
    
    // Add optional parameters if present
    if (anthropicRequest.top_p !== undefined) {
      geminiRequest.top_p = anthropicRequest.top_p;
    }
    
    if (anthropicRequest.stop_sequences && anthropicRequest.stop_sequences.length > 0) {
      geminiRequest.stop = anthropicRequest.stop_sequences;
    }
    
    // Convert tools if present
    if (tools && tools.length > 0) {
      const convertedTools = convertAnthropicToolsToGemini(tools);
      if (convertedTools.length > 0) {
        geminiRequest.tools = convertedTools;
        
        // Convert tool_choice
        if (tool_choice) {
          geminiRequest.tool_choice = convertAnthropicToolChoice(tool_choice);
        }
      }
    }
    
    console.log(`Converted request: ${geminiMessages.length} messages, max_tokens: ${geminiRequest.max_tokens}, tools: ${geminiRequest.tools?.length || 0}`);
    return { success: true, data: geminiRequest };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
    console.error('Error converting Anthropic request to Gemini format:', error);
    return { success: false, error: `Request conversion failed: ${errorMessage}` };
  }
}

function convertAnthropicMessage(msg: AnthropicMessage, index: number): GeminiMessage | null {
  let content = '';
  
  if (!msg.role) {
    console.warn(`Message at index ${index} missing role, defaulting to 'user'`);
  }
  
  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    // Handle multimodal content - extract text parts and handle tool calls
    const textParts: string[] = [];
    
    msg.content.forEach((contentItem, contentIndex) => {
      if (contentItem.type === 'text' && contentItem.text) {
        textParts.push(contentItem.text);
      } else if (contentItem.type === 'tool_use' && contentItem.name && contentItem.input) {
        // Convert tool use to a text representation for Gemini
        const toolCall = `[Tool Call: ${contentItem.name}(${JSON.stringify(contentItem.input)})]`;
        textParts.push(toolCall);
      } else if (contentItem.type === 'tool_result') {
        // Convert tool result to text
        const result = typeof contentItem.content === 'string' 
          ? contentItem.content 
          : JSON.stringify(contentItem.content);
        textParts.push(`[Tool Result: ${result}]`);
      } else if (contentItem.type !== 'text') {
        console.warn(`Message at index ${index}, content ${contentIndex}: unsupported content type ${contentItem.type}`);
      }
    });
    
    content = textParts.join('\n');
  }
  
  if (!content.trim()) {
    console.warn(`Message at index ${index} has empty content`);
    return null;
  }
  
  return {
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: content
  };
}

function convertAnthropicToolsToGemini(tools: AnthropicTool[]): GeminiTool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  }));
}

function convertAnthropicToolChoice(toolChoice: AnthropicRequest['tool_choice']): GeminiRequest['tool_choice'] {
  if (!toolChoice) return undefined;
  
  if (toolChoice === 'auto') return 'auto';
  if (toolChoice === 'any') return 'auto';
  
  if (typeof toolChoice === 'object' && toolChoice.type === 'tool' && toolChoice.name) {
    return {
      type: 'function',
      function: { name: toolChoice.name }
    };
  }
  
  return 'auto';
}

function convertGeminiToAnthropic(geminiResponse: GeminiResponse, originalRequest: AnthropicRequest): ConversionResult<AnthropicResponse> {
  try {
    // Handle error responses
    if (geminiResponse.error) {
      const errorResponse: ErrorResponse = {
        type: 'error',
        error: {
          type: geminiResponse.error.type || 'api_error',
          message: geminiResponse.error.message || 'Unknown error from Gemini API'
        }
      };
      return { success: false, error: errorResponse.error.message };
    }
    
    // Handle missing choices
    const choice = geminiResponse.choices?.[0];
    if (!choice) {
      return { success: false, error: 'No response choices from Gemini API' };
    }
    
    // Extract content and tool calls from choice
    let content: AnthropicContent[] = [];
    let stopReason: AnthropicResponse['stop_reason'] = 'end_turn';
    
    if (choice.message) {
      // Handle tool calls
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        choice.message.tool_calls.forEach(toolCall => {
          content.push({
            type: 'tool_use',
            tool_use_id: toolCall.id,
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments || '{}')
          });
        });
        stopReason = 'tool_use';
      }
      
      // Handle text content
      if (choice.message.content) {
        content.push({
          type: 'text',
          text: choice.message.content
        });
      }
    }
    
    // If no content was added, add empty text
    if (content.length === 0) {
      content.push({
        type: 'text',
        text: ''
      });
    }
    
    // Map finish reason to Anthropic format
    if (choice.finish_reason) {
      switch (choice.finish_reason) {
        case 'stop':
          stopReason = 'end_turn';
          break;
        case 'length':
          stopReason = 'max_tokens';
          break;
        case 'tool_calls':
          stopReason = 'tool_use';
          break;
        case 'content_filter':
          stopReason = 'stop_sequence';
          break;
        default:
          stopReason = 'end_turn';
      }
    }
    
    // Build Anthropic-compatible response
    const anthropicResponse: AnthropicResponse = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'message',
      role: 'assistant',
      content: content,
      model: originalRequest.model,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: geminiResponse.usage?.prompt_tokens || 0,
        output_tokens: geminiResponse.usage?.completion_tokens || 0
      }
    };
    
    return { success: true, data: anthropicResponse };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
    return { success: false, error: `Response conversion failed: ${errorMessage}` };
  }
}

async function handleStreamingResponse(geminiResponse: Response, originalRequest: AnthropicRequest): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  
  // Start processing the stream
  processGeminiStream(geminiResponse, writer, originalRequest);
  
  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function processGeminiStream(geminiResponse: Response, writer: WritableStreamDefaultWriter<any>, originalRequest: AnthropicRequest): Promise<void> {
  try {
    const reader = geminiResponse.body?.getReader();
    if (!reader) {
      throw new Error('No response body to read');
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            const stopEvent: AnthropicStreamChunk = { type: 'message_stop' };
            await writer.write(new TextEncoder().encode(`event: message_stop\ndata: ${JSON.stringify(stopEvent)}\n\n`));
            break;
          }
          
          try {
            const geminiChunk = JSON.parse(data) as GeminiStreamChunk;
            const anthropicChunk = convertGeminiStreamChunk(geminiChunk, originalRequest);
            
            if (anthropicChunk) {
              const eventData = `event: ${anthropicChunk.type}\ndata: ${JSON.stringify(anthropicChunk)}\n\n`;
              await writer.write(new TextEncoder().encode(eventData));
            }
          } catch (parseError) {
            console.error('Error parsing stream chunk:', parseError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Stream processing error:', error);
    const errorEvent: AnthropicStreamChunk = { 
      type: 'error'
    };
    const errorData = `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`;
    await writer.write(new TextEncoder().encode(errorData));
  } finally {
    await writer.close();
  }
}

function convertGeminiStreamChunk(geminiChunk: GeminiStreamChunk, originalRequest: AnthropicRequest): AnthropicStreamChunk | null {
  const choice = geminiChunk.choices?.[0];
  if (!choice) return null;
  
  const content = choice.delta?.content || '';
  
  if (content) {
    return {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'text_delta',
        text: content
      }
    };
  }
  
  // Handle tool calls in streaming
  if (choice.delta?.tool_calls && choice.delta.tool_calls.length > 0) {
    const toolCall = choice.delta.tool_calls[0];
    return {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: toolCall.function.arguments || ''
      }
    };
  }
  
  if (choice.finish_reason) {
    return {
      type: 'message_stop'
    };
  }
  
  return null;
}

// Export functions for testing
export {
  getGeminiModel,
  validateAnthropicRequest,
  convertAnthropicToGemini,
  convertGeminiToAnthropic,
  convertAnthropicMessage,
  convertAnthropicToolsToGemini,
  convertAnthropicToolChoice,
  convertGeminiStreamChunk,
  createErrorResponse
};