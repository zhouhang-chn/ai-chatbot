import asyncio
import httpx
import os
import json
from dotenv import load_dotenv

async def run_manual_openai_test():
    """Runs a manual test against the running AI Relay service using OpenAI."""
    
    # --- Configuration & Pre-checks --- #
    print("--- Manual OpenAI Relay Integration Test --- ")
    
    # Load .env from the relay service root to get its port/config
    # Assumes this script is run from the ai-relay-service directory
    dotenv_path = os.path.join(os.path.dirname(__file__), '../.env')
    if not os.path.exists(dotenv_path):
        print(f"[ERROR] Relay service .env file not found at: {dotenv_path}")
        print("Please ensure the .env file exists in the ai-relay-service directory.")
        return
        
    load_dotenv(dotenv_path=dotenv_path)

    # Check if the relay service itself likely has the OpenAI key configured (reminder)
    openai_key_present = bool(os.getenv("OPENAI_API_KEY"))
    if not openai_key_present:
        print("[WARN] OPENAI_API_KEY not found in the loaded .env file.")
        print("       Ensure the relay service's .env file contains the key for this test to succeed.")
        # Decide whether to proceed or exit
        # proceed = input("Proceed anyway? (y/n): ").lower()
        # if proceed != 'y':
        #     return 
    else:
        print("[INFO] OPENAI_API_KEY seems to be present in the relay service .env file.")

    relay_port = os.getenv("PORT", "8001")
    relay_url = f"http://localhost:{relay_port}/api/v1/generate/stream"
    print(f"[INFO] Targeting relay service endpoint: {relay_url}")

    # --- Prepare Request Data --- #
    payload = {
        "model_id": "gpt-4-turbo", # Use a known OpenAI model ID
        "messages": [
            {"role": "system", "content": "You are a helpful chatbot."},
            {"role": "user", "content": "Explain the concept of asynchronous programming in Python simply."}
        ],
        "system_prompt": None # Or provide one if desired
    }
    print(f"[INFO] Sending payload: {json.dumps(payload, indent=2)}")

    # --- Make API Call --- #
    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            print("[INFO] Connecting to relay service...")
            async with client.stream("POST", relay_url, json=payload) as response:
                print(f"[INFO] Relay service responded with status: {response.status_code}")
                
                if response.status_code != 200:
                    error_content = await response.aread()
                    print(f"[ERROR] Relay service returned error {response.status_code}.")
                    print(f"        Response body: {error_content.decode()}")
                    return
                
                print("[INFO] Receiving stream from relay service...")
                print("-------------------- RESPONSE STREAM --------------------"),
                async for chunk in response.aiter_bytes():
                    # Print chunks as they arrive
                    print(chunk.decode('utf-8'), end="", flush=True) 
                print("\n---------------------------------------------------------")
                print("[INFO] Stream finished.")

        duration = time.time() - start_time
        print(f"[SUCCESS] Manual test completed in {duration:.2f}s.")

    except httpx.ConnectError as e:
        duration = time.time() - start_time
        print(f"\n[ERROR] Connection to relay service failed after {duration:.2f}s: {e}")
        print(f"        Is the relay service running on port {relay_port}?")
    except Exception as e:
        duration = time.time() - start_time
        print(f"\n[ERROR] An unexpected error occurred after {duration:.2f}s: {e}")

    print('---------------------------------------------------------')

if __name__ == "__main__":
    import time # Import time here for duration calculation
    asyncio.run(run_manual_openai_test()) 