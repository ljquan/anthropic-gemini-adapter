#!/bin/bash

echo "🧪 Testing Anthropic to Gemini API Adapter"
echo "==========================================="

# Check if URL is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <your-worker-url>"
    echo "Example: $0 https://your-worker.your-subdomain.workers.dev"
    exit 1
fi

WORKER_URL=$1

echo "🎯 Testing endpoint: $WORKER_URL"

# Test basic request
echo ""
echo "📝 Testing basic request..."

curl -X POST "$WORKER_URL/v1/messages" \
  -H "x-api-key: test-key" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-sonnet",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Hello! Please respond with just the word \"success\" if you can understand this message."}
    ]
  }' \
  -w "\n\nHTTP Status: %{http_code}\nResponse Time: %{time_total}s\n"

echo ""
echo "✅ Test completed!"
echo "📋 Expected response should contain 'success' in the content"