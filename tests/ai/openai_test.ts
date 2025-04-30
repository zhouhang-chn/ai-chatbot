import dotenv from 'dotenv';

// Load environment variables from .env.local file FIRST
dotenv.config({ path: '.env.local' });

// Bootstrap global-agent, which reads proxy vars (e.g., GLOBAL_AGENT_HTTPS_PROXY or HTTPS_PROXY)
import 'global-agent/bootstrap';

// Other imports
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
// Remove SocksProxyAgent import - we rely on global-agent now
// import { SocksProxyAgent } from 'socks-proxy-agent';

async function runTest() {
  const apiKey = process.env.OPENAI_API_KEY;
  // Log relevant proxy variables for debugging
  const gaProxy = process.env.GLOBAL_AGENT_HTTPS_PROXY;
  const httpsProxy = process.env.HTTPS_PROXY;
  const httpProxy = process.env.HTTP_PROXY;
  const allProxy = process.env.ALL_PROXY;

  console.log('--- OpenAI Connection Test (global-agent SOCKS attempt) ---');

  if (!apiKey) {
    console.error('[FAIL] OPENAI_API_KEY is not set.');
    return;
  }
  console.log('[INFO] OPENAI_API_KEY found.');

  // Log which proxy variables are set
  console.log(`[INFO] GLOBAL_AGENT_HTTPS_PROXY: ${gaProxy ?? 'Not set'}`);
  console.log(`[INFO] HTTPS_PROXY: ${httpsProxy ?? 'Not set'}`);
  console.log(`[INFO] HTTP_PROXY: ${httpProxy ?? 'Not set'}`);
  console.log(`[INFO] ALL_PROXY: ${allProxy ?? 'Not set'}`);

  if (!(gaProxy || httpsProxy || httpProxy || allProxy)) {
      console.warn('[WARN] No relevant proxy environment variables found for global-agent.');
  }

  const modelId = 'gpt-4-turbo';
  // Initialize provider normally, assuming global-agent patches fetch
  const model = openai(modelId);

  const testPrompt = "What are the advantages of using Next.js?";
  const systemPrompt = "You are a helpful assistant that generates concise titles.";

  console.log(`[INFO] Attempting call via global-agent & AI SDK to model: ${modelId}...`);

  let startTime = 0;
  try {
    startTime = Date.now();
    // Call generateText normally, hoping global-agent intercepts the fetch
    const { text, usage, finishReason, warnings } = await generateText({
      model: model,
      system: systemPrompt,
      prompt: testPrompt,
      temperature: 0,
      // Remove fetchOptions, not valid
    });
    const duration = Date.now() - startTime;

    console.log('\n--- API Call Successful --- ');
    console.log(`Finish Reason: ${finishReason}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Usage: ${JSON.stringify(usage)} tokens`);
    if (warnings) {
        console.log(`Warnings: ${JSON.stringify(warnings)}`);
    }
    console.log('\nGenerated Text:');
    console.log('--------------------');
    console.log(text);
    console.log('--------------------');
    console.log('[SUCCESS] Test completed successfully.');

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n--- API Call Failed --- ');
    console.error(`Duration before failure: ${duration}ms`);
    console.error('[ERROR]', error);
    console.log('-----------------------');
    console.log('[FAIL] Test failed.');
  }
  console.log('----------------------------');
}

runTest(); 