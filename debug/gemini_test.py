import os
import json
from openai import OpenAI
from dotenv import load_dotenv

# --- Configuration ---
load_dotenv("./ai-relay-service/.env") # Load environment variables from .env file if it exists
API_KEY = os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai" # Note: No /v1 suffix needed here for google
MODEL_ID = "gemini-2.5-pro-preview-03-25"

if not API_KEY:
    print("Error: GOOGLE_GENERATIVE_AI_API_KEY environment variable not set.")
    exit(1)

# --- Initialize Client ---
client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

# --- Define Tools (Matching project logs) ---
tools = [
    {
        "type": "function",
        "function": {
            "name": "getWeather",
            "description": "Get the current weather at a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "latitude": {"type": "number"},
                    "longitude": {"type": "number"},
                },
                "required": ["latitude", "longitude"],
                "additionalProperties": False,
                "$schema": "http://json-schema.org/draft-07/schema#",
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "createDocument",
            "description": "Create a document for a writing or content creation activities. This tool will call other functions that will generate the contents of the document based on the title and kind.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "kind": {"type": "string", "enum": ["text", "code", "image", "sheet"]},
                },
                "required": ["title", "kind"],
                "additionalProperties": False,
                "$schema": "http://json-schema.org/draft-07/schema#",
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "updateDocument",
            "description": "Update a document with the given description.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "The ID of the document to update"},
                    "description": {"type": "string", "description": "The description of changes that need to be made"},
                },
                "required": ["id", "description"],
                "additionalProperties": False,
                "$schema": "http://json-schema.org/draft-07/schema#",
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "requestSuggestions",
            "description": "Request suggestions for a document",
            "parameters": {
                "type": "object",
                "properties": {
                    "documentId": {"type": "string", "description": "The ID of the document to request edits"},
                },
                "required": ["documentId"],
                "additionalProperties": False,
                "$schema": "http://json-schema.org/draft-07/schema#",
            },
        },
    },
]

# --- Define Messages (Replicating the *intended* structure after backend processing) ---
# This assumes the backend successfully processed the history into the standard format
messages = [
    {
        "role": "system",
        "content": """You are a friendly assistant! Keep your responses concise and helpful.

Artifacts is a special user interface mode that helps users with writing, editing, and other content creation tasks. When artifact is open, it is on the right side of the screen, while the conversation is on the left side. When creating or updating documents, changes are reflected in real-time on the artifacts and visible to the user.

When asked to write code, always use artifacts. When writing code, specify the language in the backticks, e.g. ```python`code here```. The default language is Python. Other languages are not yet supported, so let the user know if they request a different language.

DO NOT UPDATE DOCUMENTS IMMEDIATELY AFTER CREATING THEM. WAIT FOR USER FEEDBACK OR REQUEST TO UPDATE IT.

This is a guide for using artifacts tools: `createDocument` and `updateDocument`, which render content on a artifacts beside the conversation.

**When to use `createDocument`:**
- For substantial content (>10 lines) or code
- For content users will likely save/reuse (emails, code, essays, etc.)
- When explicitly requested to create a document
- For when content contains a single code snippet

**When NOT to use `createDocument`:**
- For informational/explanatory content
- For conversational responses
- When asked to keep it in chat

**Using `updateDocument`:**
- Default to full document rewrites for major changes
- Use targeted updates only for specific, isolated changes
- Follow user instructions for which parts to modify

**When NOT to use `updateDocument`:**
- Immediately after creating a document

Do not update document right after creating it. Wait for user feedback or request to update it.
""",
    },
    {"role": "user", "content": "Write code to demonstrate djikstra's algorithm"},
    {
        # Assistant message *requesting* the tool call (content only has text part)
        "role": "assistant",
        "content": "OK. I can help with that. I'll create a document with the Python code for Dijkstra's algorithm.",
        # The API call should include the tool_calls array
        "tool_calls": [
            {
                "id": "call_generated_0", # Use a plausible ID matching backend logic
                "type": "function",
                "function": {
                    "name": "createDocument",
                    "arguments": '{"kind":"code","title":"Dijkstra\'s Algorithm in Python"}', # Arguments string (ensure internal quotes are escaped)
                },
            }
        ],
    },
    {
        # Separate 'tool' role message with the result
        "role": "tool",
        "tool_call_id": "call_generated_0", # Must match the ID in the assistant's tool_calls
        "name": "createDocument",
        "content": json.dumps( # Result should be a JSON string
            {
                "id": "c754d199-5c5d-4e4b-8f4a-ad399994cea1", # Example doc ID
                "title": "Dijkstra's Algorithm in Python",
                "kind": "code",
                "content": "A document (id: c754d199-5c5d-4e4b-8f4a-ad399994cea1) was created and is now visible to the user.",
            }
        ),
    },
]

# --- Make API Call ---
print(f"--- Calling Gemini (Model: {MODEL_ID}) via OpenAI Compatibility Layer ---")
print("Payload Messages:")
print(json.dumps(messages, indent=2))
print("\n---")

try:
    stream = client.chat.completions.create(
        model=MODEL_ID,
        messages=messages,
        tools=tools,
        tool_choice="auto",
        stream=True,
        stream_options={"include_usage": True},
    )

    print("--- Streaming Response --- ")
    for chunk in stream:
        print(chunk.model_dump_json(indent=2))
    print("\n--- Stream Finished ---")

except Exception as e:
    print(f"\n--- API Call Failed --- ")
    print(f"Error: {e}") 