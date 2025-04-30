# AI Relay Service

This FastAPI service acts as a proxy and relay for requests to various AI providers (OpenAI, Google Gemini, etc.). It allows the main Next.js application to offload direct AI interactions, centralize API key management, and handle potentially complex network configurations (like proxies).

## Setup

1.  **Navigate:** Open your terminal in this directory (`ai-tools/ai-chatbot/ai-relay-service`).
2.  **Create Conda Environment (Recommended):**
    ```bash
    conda create --name ai-chatbot python=3.11
    ```
3.  **Activate Conda Environment:**
    ```bash
    conda activate  ai-chatbot
    ```
4.  **Install Dependencies:**
    ```bash
    # Ensure your activated conda environment is selected
    pip install -r requirements.txt
    # If using SOCKS proxy, ensure httpx[socks] is installed:
    # pip install httpx[socks]
    ```

## Configuration

1.  **Create `.env` file:** Copy the contents from the `.env.example` (or manually create it if missing) in this directory (`ai-relay-service/.env`).
    ```dotenv
    # Example structure - DO NOT COMMIT ACTUAL KEYS!
    OPENAI_API_KEY="sk-..."
    GOOGLE_GENERATIVE_AI_API_KEY="AIzaSy..."
    # XAI_API_KEY="..."

    # Optional Proxy Settings (uncomment and configure if needed)
    # Example: HTTPS_PROXY="socks5://localhost:1080"
    # NO_PROXY="localhost,127.0.0.1"

    # Settings for the relay service itself
    FRONTEND_ORIGIN="http://localhost:3000" # Next.js app URL
    PORT="8001"
    ```
2.  **Fill in Values:** Add your actual API keys for the providers you want to use. Configure proxy settings if required.
3.  **`FRONTEND_ORIGIN`:** Ensure this matches the URL where your Next.js development server runs.

## Running for Development / Testing

1.  **Activate Environment:** Make sure your conda environment is activated:
    ```bash
    conda activate ai-relay-env
    ```
2.  **Run Uvicorn:** Execute the following command from the `ai-relay-service` directory:
    ```bash
    uvicorn app.main:app --reload --port <PORT>
    ```
    *   Replace `<PORT>` with the port number specified in your `.env` file (default is 8001).
    *   The `--reload` flag automatically restarts the server when code changes are detected.

3.  **Access:** The service will be available at `http://localhost:<PORT>` (e.g., `http://localhost:8001`). You can test the health check endpoint by visiting `http://localhost:8001/health` in your browser.

## Running Tests

1.  **Activate Environment:** Make sure your conda environment is activated:
    ```bash
    conda activate ai-relay-env
    ```
2.  **Install Test Dependencies:** If you haven't already, install the testing libraries:
    ```bash
    pip install pytest pytest-asyncio httpx pytest-mock
    ```
3.  **Run Pytest:** Execute pytest from the `ai-relay-service` directory:
    ```bash
    pytest
    ```
    Pytest will automatically discover and run the tests in the `tests/` directory.

## Manual Integration Test (Optional)

There is a script `tests/manual_openai_relay_test.py` designed to test the connection to a *running* relay service and through to the *real* OpenAI API.

**Prerequisites:**

1.  The AI Relay Service *must* be running (e.g., via `uvicorn app.main:app --port 8001`).
2.  The `.env` file for the relay service must contain a valid `OPENAI_API_KEY`.
3.  Proxy variables in `.env` must be correctly configured if needed for the relay service to reach OpenAI.
4.  Your conda environment must be activated (`conda activate ai-chatbot`).

**To Run:**

Execute the script directly from the `ai-relay-service` directory:

```bash
python tests/manual_openai_relay_test.py
```

This script will:
*   Load the relay service's `.env` file.
*   Check if `OPENAI_API_KEY` appears to be set (as a reminder).
*   Make a POST request to the `/api/v1/generate/stream` endpoint of the running service.
*   Print the streamed response chunks directly from OpenAI via the relay.
*   Report success or any connection errors.

This helps verify the end-to-end connectivity through the relay service to the actual AI provider.

## Basic Usage

The primary endpoints intended for use by the Next.js backend are:

*   `POST /api/v1/generate/stream`: Sends messages and model info, receives a stream of AI response chunks.
*   `POST /api/v1/generate/title`: Sends a prompt and model info, receives a generated title.
*   `GET /health`: Simple health check endpoint.
