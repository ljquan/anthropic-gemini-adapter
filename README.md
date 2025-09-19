# Anthropic to Gemini API Adapter

A Cloudflare Worker that converts Anthropic Claude API calls to Google Gemini API calls, allowing you to use Gemini models through the Claude API interface.

## Model Mapping

- `claude-3-sonnet` → `google/gemini-2.5-flash`
- `claude-3-opus` → `google/gemini-2.5-pro`
- `claude-3-haiku` → `google/gemini-2.5-flash-lite`

## Setup

### Option 1: Quick Setup (Recommended)

1. Install dependencies:
```bash
npm install
```

2. Run the deployment script:
```bash
./deploy.sh
```

This script will:
- Check for wrangler installation
- Prompt you to securely set your Gemini API key
- Deploy your worker automatically

### Option 2: Manual Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your Gemini API key as a secret:
```bash
wrangler secret put GEMINI_API_KEY
```

3. Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Usage

Once deployed, you can use your Cloudflare Worker URL as if it were the Anthropic API endpoint:

```bash
curl https://your-worker.your-subdomain.workers.dev/v1/messages \
  -H "x-api-key: any-value" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-sonnet",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## Testing

After deployment, test your adapter with the included test script:

```bash
./test.sh https://your-worker.your-subdomain.workers.dev
```

Or test manually with curl:

```bash
curl https://your-worker.your-subdomain.workers.dev/v1/messages \
  -H "x-api-key: any-value" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-sonnet",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## Development

To run locally:
```bash
npm run dev
```

## Configuration

Edit `wrangler.toml` to customize your deployment settings.

## Features

- ✅ Full Anthropic API compatibility
- ✅ Model mapping (Claude → Gemini)
- ✅ Streaming support
- ✅ Error handling and logging
- ✅ CORS support
- ✅ Request validation

## Supported Parameters

- `model` - Automatically mapped to appropriate Gemini model
- `messages` - Converted to Gemini format
- `max_tokens` - Passed through
- `temperature` - Passed through
- `top_p` - Passed through
- `stop_sequences` - Converted to Gemini `stop` parameter
- `stream` - Streaming responses supported
- `system` - System prompts supported