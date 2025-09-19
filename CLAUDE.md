# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based Cloudflare Worker that acts as an API adapter, converting Anthropic Claude API calls to Google Gemini API calls with full support for MCP Tools and Function Calls. It allows clients to use Gemini models through the familiar Claude API interface while maintaining compatibility with advanced features like tool usage.

## Development Commands

### Local Development
- `npm run dev` - Start local development server using Wrangler
- `npm run tail` - Monitor live worker logs

### Build & Type Checking
- `npm run build` - Type check the project
- `npm run type-check` - Run TypeScript type checking
- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint:fix` - Auto-fix ESLint issues

### Testing
- `npm run test` - Run Vitest unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `./test.sh <worker-url>` - Test deployed worker with sample request

### Deployment
- `npm run deploy` - Deploy worker to Cloudflare Workers
- `./deploy.sh` - Interactive deployment script that sets up API key and deploys

## Architecture

### TypeScript Structure

**Core Files**
- `src/types.ts` - Complete type definitions for Anthropic, Gemini, and MCP APIs
- `src/worker.ts` - Main worker implementation with full type safety
- `test/` - Comprehensive test suite with unit and integration tests

**Type Safety**
- Full TypeScript implementation with strict type checking
- Comprehensive interfaces for all API formats
- Type-safe conversion functions with error handling
- Proper error types and response validation

### Core Components

**Model Mapping (`MODEL_MAPPING`)**
- Maps Claude model names to equivalent Gemini models
- Supports pattern-based fallback for unknown model variants
- Located in `src/worker.ts:25-47`

**Request Flow**
1. Receives Anthropic-format requests at `/v1/messages`
2. Validates request structure using `validateAnthropicRequest()`
3. Converts request format using `convertAnthropicToGemini()`
4. Handles tool definitions and function call conversion
5. Forwards to Gemini API via aimlapi.com
6. Converts response back using `convertGeminiToAnthropic()`
7. Returns Anthropic-compatible response with proper tool usage

**MCP Tools & Function Calls**
- Full support for Anthropic tool definitions
- Converts tools to Gemini function format
- Handles tool_choice parameters (auto, any, specific tool)
- Processes tool_use and tool_result content types
- Supports function call streaming
- Maintains tool call IDs and proper error handling

**Streaming Support**
- Handles both regular and streaming responses
- Streaming uses Server-Sent Events (SSE) format
- Support for tool call streaming with partial JSON
- Stream processing in `handleStreamingResponse()` and `processGeminiStream()`

### Key Functions

**Conversion Functions**
- `getGeminiModel()` - Model name mapping with fallback logic
- `convertAnthropicToGemini()` - Request format conversion with tool support
- `convertGeminiToAnthropic()` - Response format conversion with tool calls
- `convertAnthropicMessage()` - Message content conversion with multimodal support
- `convertAnthropicToolsToGemini()` - Tool definition conversion
- `convertAnthropicToolChoice()` - Tool choice parameter conversion
- `convertGeminiStreamChunk()` - Stream chunk conversion

**Validation & Error Handling**
- `validateAnthropicRequest()` - Request validation with detailed error messages
- `createErrorResponse()` - Standardized error response creation
- Comprehensive error handling with proper HTTP status codes
- Type-safe error responses matching Anthropic API format

### Configuration

**Environment Variables**
- `GEMINI_API_KEY` - Required secret for Gemini API access (set via `wrangler secret put`)

**Wrangler Configuration**
- Main entry point: `src/worker.ts`
- Production and development environments configured in `wrangler.toml`
- Worker compatibility date set to "2024-01-01"
- TypeScript build support enabled

**Development Tools**
- Vitest for unit testing with mocking support
- ESLint with TypeScript rules
- Full type checking with strict TypeScript configuration
- Test coverage reporting

### API Compatibility

Supports complete Anthropic API features:
- Message-based conversation format
- System prompts
- Streaming responses with SSE
- Temperature, top_p, max_tokens parameters
- Stop sequences
- **MCP Tools integration** - Full tool definition support
- **Function calls** - Tool usage with input/output handling
- **Tool results** - Tool execution result processing
- Multimodal content (text extraction with tool support)
- CORS headers for web clients
- Proper error responses matching Anthropic format

**Tool Support Features**
- Tool definitions with JSON schema validation
- Tool choice modes: auto, any, specific tool selection
- Tool use content blocks with structured input
- Tool result content blocks with success/error states
- Function call streaming with partial JSON support
- Tool call ID tracking and response correlation

The worker maintains full API compatibility while mapping models:
- `claude-3-sonnet` → `google/gemini-2.5-flash`
- `claude-3-opus` → `google/gemini-2.5-pro`  
- `claude-3-haiku` → `google/gemini-2.5-flash-lite`

### Testing

**Test Coverage**
- Unit tests for all conversion functions
- Integration tests for end-to-end API compatibility
- Streaming response testing
- Tool and function call testing
- Error handling and edge case testing
- Mock environment setup for Cloudflare Workers

**Test Commands**
- Run tests: `npm run test`
- Watch mode: `npm run test:watch`
- Coverage: `npm run test:coverage`

The test suite ensures complete compatibility with both Anthropic and Gemini API formats, including advanced features like tool usage and streaming responses.