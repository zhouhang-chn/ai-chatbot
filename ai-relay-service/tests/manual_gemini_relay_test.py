import asyncio
import httpx
import os
import sys
import json
from dotenv import load_dotenv

# Adjust path to load .env from the parent directory (ai-relay-service)
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env') 
load_dotenv(dotenv_path=dotenv_path)

# Configuration
# Use the full model ID as expected by the frontend/relay router
MODEL_ID = "google-gemini-1.5-flash" 
# Get relay service URL from environment variable or use default
RELAY_SERVICE_URL = os.getenv("AI_RELAY_SERVICE_URL", "http://localhost:8001")
STREAM_ENDPOINT = f"{RELAY_SERVICE_URL}/api/v1/generate/stream"
TIMEOUT_SECONDS = 60  # Timeout for the request

async def run_test():
    """Connects to the relay service and streams response from a Gemini model."""
    print(f"--- Manual Gemini Relay Test --- START --- Model: {MODEL_ID} ---")
    print(f"Relay Service Endpoint: {STREAM_ENDPOINT}")

    # Prepare the payload (similar structure to what frontend sends)
    payload = {
        "model_id": MODEL_ID,
        "messages": [
            {"role": "user", "content": "Explain the difference between a star and a planet in simple terms."}
        ],
        "system_prompt": "You are a helpful assistant designed to explain complex topics simply."
    }

    print("\nPayload:")
    print(json.dumps(payload, indent=2))
    print("\n--- Connecting to Relay Service & Streaming --- START ---")

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            async with client.stream("POST", STREAM_ENDPOINT, json=payload) as response:
                print(f"Relay Service Response Status: {response.status_code}")
                
                # Check if the relay service responded successfully
                if response.status_code != 200:
                    error_body = await response.aread()
                    print(f"Error from Relay Service:\n{error_body.decode()}")
                    return

                print("\n--- Streamed Response Chunks --- START ---")
                async for chunk in response.aiter_text():
                    print(chunk, end="", flush=True)
                print("\n--- Streamed Response Chunks --- END --- \n")
                
    except httpx.TimeoutException:
        print(f"\nError: Request to relay service timed out after {TIMEOUT_SECONDS} seconds.")
    except httpx.ConnectError as e:
        print(f"\nError: Could not connect to the relay service at {RELAY_SERVICE_URL}. Is it running? Details: {e}")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
    finally:
        print("--- Manual Gemini Relay Test --- END ---")

if __name__ == "__main__":
    # Ensure the parent directory (ai-relay-service) is in sys.path for imports if needed later
    # sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
    asyncio.run(run_test()) 