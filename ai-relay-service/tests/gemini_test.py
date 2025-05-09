import asyncio
import os
import sys
import json
from dotenv import load_dotenv
from openai import AsyncOpenAI, RateLimitError, NotFoundError, APIConnectionError, APIStatusError
import httpx
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Adjust path to load .env from the parent directory (ai-relay-service)
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

# --- Configuration --- 
MODEL_ID = "gemini-2.5-pro-preview-03-25"  
GOOGLE_API_KEY = os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")
GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
TIMEOUT_SECONDS = 60

# Proxy setup (optional, OpenAI library usually picks up env vars)
# PROXIES = {
#     "http://": os.getenv("HTTP_PROXY"),
#     "https://": os.getenv("HTTPS_PROXY"),
# }
# http_client = httpx.AsyncClient(proxies=PROXIES) if any(PROXIES.values()) else None

async def run_test():
    """Connects directly to Google Gemini API via OpenAI compatibility layer and streams response."""
    print(f"--- Direct Gemini API Test (via OpenAI Lib) --- START --- Model: {MODEL_ID} ---")
    
    if not GOOGLE_API_KEY:
        logger.error("Error: GOOGLE_GENERATIVE_AI_API_KEY environment variable not set.")
        print("--- Direct Gemini API Test --- END ---")
        return

    print(f"Target Base URL: {GOOGLE_BASE_URL}")
    print(f"Using API Key: {'*' * (len(GOOGLE_API_KEY) - 4) + GOOGLE_API_KEY[-4:] if GOOGLE_API_KEY else 'None'}")
    print(f"Proxy ENV HTTPS_PROXY: {os.getenv('HTTPS_PROXY')}")
    print(f"Proxy ENV ALL_PROXY: {os.getenv('ALL_PROXY')}")

    # Prepare the messages
    messages = [
        {"role": "user", "content": "Explain step-by-step how to calculate the area of a circle with radius r."}
    ]

    print("\nMessages:")
    print(json.dumps(messages, indent=2))
    print("\n--- Connecting Directly to Google API & Streaming --- START ---")

    try:
        # Initialize the client specifically for Google's OpenAI-compatible endpoint
        client = AsyncOpenAI(
            api_key=GOOGLE_API_KEY,
            base_url=GOOGLE_BASE_URL,
            timeout=TIMEOUT_SECONDS,
            # http_client=http_client # Pass explicit httpx client if needed for complex proxy/SSL
        )

        stream = await client.chat.completions.create(
            model=MODEL_ID,
            messages=messages, # type: ignore
            stream=True,
            temperature=0.7
        )
        
        logger.info("\n--- Streamed Response Chunks --- START ---")
        async for chunk in stream:
            logger.info("\n--- Received Chunk ---")
            # logger.info(f"Raw chunk object: {chunk}")
            content_part = None
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                logger.info(f"Delta object: {delta}")
                if delta:
                    if delta.content:
                        content_part = delta.content
                        # logger.info(f"  Delta Content: {json.dumps(delta.content)}")
                    if delta.role:
                        pass
                        # logger.info(f"  Delta Role: {delta.role}")
                    if delta.tool_calls:
                        pass
                        # logger.info(f"  Delta Tool Calls: {delta.tool_calls}")

                    delta_dict = delta.model_dump(exclude_unset=True)
                    other_keys = set(delta_dict.keys()) - {'content', 'role', 'tool_calls', 'function_call'}
                    if other_keys:
                        logger.warning(f"  *** Delta contained unexpected keys: {other_keys} ***")
                        for key in other_keys:
                           logger.warning(f"    Value of '{key}': {delta_dict[key]}")

                finish_reason = chunk.choices[0].finish_reason
                if finish_reason:
                    logger.info(f"Finish Reason: {finish_reason}")

            if content_part is not None:
                print(content_part, end="", flush=True)
            
            if chunk.usage:
                logger.info(f"Usage Data: {chunk.usage}")

        print("\n--- Streamed Response Chunks --- END --- \n")

    # Specific OpenAI library errors (via compatibility layer)
    except NotFoundError as e:
        print(f"\nAPI Error (404 Model Not Found) for model {MODEL_ID}: {e}")
    except RateLimitError as e:
        print(f"\nAPI Error (429 Rate Limit Exceeded) for model {MODEL_ID}: {e}")
    except APIConnectionError as e:
        print(f"\nAPI Connection Error: Could not connect to {GOOGLE_BASE_URL}. Details: {e}")
    except APIStatusError as e:
        print(f"\nAPI Status Error: Received status {e.status_code}. Message: {e.message}")
    # General HTTP errors
    except httpx.TimeoutException:
        print(f"\nError: Request to Google API timed out after {TIMEOUT_SECONDS} seconds.")
    except httpx.ConnectError as e:
        print(f"\nError: Could not connect to the Google API endpoint at {GOOGLE_BASE_URL}. Check network/proxy. Details: {e}")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {type(e).__name__} - {e}")
    finally:
        logger.info("--- Direct Gemini API Test --- END ---")

if __name__ == "__main__":
    # Ensure the parent directory (ai-relay-service) is in sys.path for imports if needed later
    # sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
    asyncio.run(run_test()) 