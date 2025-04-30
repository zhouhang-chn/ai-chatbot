import os
import time
import httpx
from openai import OpenAI, APITimeoutError, APIConnectionError
from dotenv import load_dotenv

# Load environment variables from .env.local file
dotenv_path = os.path.join(os.path.dirname(__file__), '../../.env.local')
load_dotenv(dotenv_path=dotenv_path)

def run_test():
    api_key = os.getenv("OPENAI_API_KEY")
    https_proxy = os.getenv("HTTPS_PROXY")

    print('--- OpenAI Python Connection Test ---')

    if not api_key:
        print('[FAIL] OPENAI_API_KEY is not set in environment variables.')
        return
    print('[INFO] OPENAI_API_KEY found.')

    # httpx (used by openai) automatically respects HTTPS_PROXY/HTTP_PROXY/ALL_PROXY env vars
    if https_proxy:
        print(f'[INFO] HTTPS_PROXY found: {https_proxy}')
        print("[INFO] OpenAI client will use this proxy automatically via httpx.")
    elif os.getenv("HTTP_PROXY"):
        print(f'[INFO] HTTP_PROXY found: {os.getenv("HTTP_PROXY")}')
        print("[INFO] OpenAI client will use this proxy automatically via httpx.")
    else:
        print('[INFO] No HTTP/HTTPS proxy environment variables set.')

    # Initialize OpenAI client (no need to manually pass http_client for proxy)
    # It will create its own httpx client internally which respects env vars
    client = OpenAI(api_key=api_key)

    model_id = "gpt-4-turbo"
    test_prompt = "What are the advantages of using Next.js?"
    system_prompt = "You are a helpful assistant."

    print(f'[INFO] Attempting to call OpenAI model: {model_id}...')
    print(f'[INFO] System Prompt: {system_prompt}')
    print(f'[INFO] User Prompt: {test_prompt}')

    start_time = 0.0 # Initialize start_time
    try:
        start_time = time.time()

        response = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": test_prompt}
            ],
            temperature=0,
            max_tokens=150 # Limit tokens for test
        )

        duration = time.time() - start_time

        print('\n--- API Call Successful --- ')
        print(f"Finish Reason: {response.choices[0].finish_reason}")
        print(f"Duration: {duration:.2f}s")
        print(f"Usage: {response.usage.total_tokens} tokens")
        print('\nGenerated Text:')
        print('--------------------')
        print(response.choices[0].message.content)
        print('--------------------')
        print('[SUCCESS] Test completed successfully.')

    except APITimeoutError as e:
        duration = time.time() - start_time
        print('\n--- API Call Failed (Timeout) --- ')
        print(f"Duration before failure: {duration:.2f}s")
        print(f'[ERROR] Timeout connecting to OpenAI: {e}')
        print('-----------------------')
        print('[FAIL] Test failed.')
    except APIConnectionError as e:
        duration = time.time() - start_time
        print('\n--- API Call Failed (Connection Error) --- ')
        print(f"Duration before failure: {duration:.2f}s")
        print(f'[ERROR] Connection error: {e}')
        print('-----------------------')
        print('[FAIL] Test failed.')
    except Exception as e:
        duration = time.time() - start_time # Keep duration calculation for consistency
        print('\n--- API Call Failed (Other Error) --- ')
        print(f"Duration before failure: {duration:.2f}s")
        print(f'[ERROR] An unexpected error occurred: {e}')
        print(f'Type: {type(e)}')
        print('-----------------------')
        print('[FAIL] Test failed.')

    print('----------------------------')

if __name__ == "__main__":
    run_test()
