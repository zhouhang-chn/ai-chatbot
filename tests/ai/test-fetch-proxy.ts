       // test-fetch-proxy.ts
       import dotenv from 'dotenv';

       // Load .env.local
       dotenv.config({ path: '.env.local' });

       async function testFetch() {
         const proxy = process.env.HTTPS_PROXY;
         const url = 'https://api.openai.com'; // Or even just 'https://httpbin.org/get'

         console.log(`--- Minimal Fetch Test ---`);
         console.log(`Using URL: ${url}`);
         if (proxy) {
           console.log(`HTTPS_PROXY is set: ${proxy}`);
         } else {
           console.log(`HTTPS_PROXY is NOT set.`);
         }
         console.log('Attempting fetch...');

         let startTime = 0; // Declare startTime outside
         try {
           startTime = Date.now(); // Assign inside
           // Standard fetch should pick up HTTPS_PROXY automatically
           const response = await fetch(url, { signal: AbortSignal.timeout(15000) }); // 15s timeout
           const duration = Date.now() - startTime;
           console.log(`\n--- Fetch Successful ---`);
           console.log(`Status: ${response.status}`);
           console.log(`Duration: ${duration}ms`);
           // console.log('Response Body:', await response.text()); // Optional: See body
         } catch (error) {
           const duration = Date.now() - startTime; // Might error if startTime not set
           console.error('\n--- Fetch Failed ---');
           console.error(`Duration before failure: ${duration}ms approx.`);
           console.error('[ERROR]', error);
         }
         console.log('------------------------');
       }

    testFetch();