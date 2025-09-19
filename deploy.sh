#!/bin/bash

echo "🚀 Deploying Anthropic to Gemini API Adapter"
echo "============================================="

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler is not installed. Please install it first:"
    echo "   npm install -g wrangler"
    exit 1
fi

# Check if GEMINI_API_KEY is set as a secret
echo "📝 Setting up Gemini API key..."
echo "Please enter your Gemini API key (it will be stored securely as a Cloudflare secret):"
wrangler secret put GEMINI_API_KEY

if [ $? -ne 0 ]; then
    echo "❌ Failed to set GEMINI_API_KEY. Please try again."
    exit 1
fi

echo "✅ API key configured successfully"

# Deploy the worker
echo "🔄 Deploying worker..."
wrangler deploy

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "🎉 Your adapter is now live!"
    echo "📋 Next steps:"
    echo "   1. Get your worker URL from the deployment output above"
    echo "   2. Use it as your Claude API endpoint"
    echo "   3. Test with: curl https://your-worker.your-subdomain.workers.dev/v1/messages"
    echo ""
    echo "📖 See README.md for usage examples"
else
    echo "❌ Deployment failed. Please check the error messages above."
    exit 1
fi