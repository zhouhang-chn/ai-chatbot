import os
import httpx
import asyncio
import logging
import json # Import json
import hashlib # Import hashlib
from openai import AsyncOpenAI, RateLimitError, NotFoundError, APIConnectionError, APIStatusError
from typing import List, Dict, Any, AsyncGenerator

logger = logging.getLogger(__name__)

# --- Custom Exceptions --- #
class ProviderError(Exception):
    """Custom exception for provider-related issues."""
    pass

class ModelNotFoundError(Exception):
    """Custom exception when a model isn't found or supported by the provider."""
    pass

class CacheError(Exception):
    """Custom exception for cache-related errors."""
    pass

# --- In-Memory Cache --- #
llm_cache: Dict[str, List[bytes]] = {}
logger.info("Initialized in-memory LLM cache.")

# --- Environment Variables --- # 
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")
# XAI_API_KEY = os.getenv("XAI_API_KEY") # Add when/if xai has a Python SDK

# We will rely on standard proxy env vars (HTTPS_PROXY, etc.)
# being picked up automatically by the OpenAI library's internal httpx client.
logger.info(f"HTTPS_PROXY env var: {os.getenv('HTTPS_PROXY')}")
logger.info(f"HTTP_PROXY env var: {os.getenv('HTTP_PROXY')}")
logger.info(f"ALL_PROXY env var: {os.getenv('ALL_PROXY')}")

# --- Helper Function for AI SDK Stream Formatting --- #

def format_stream_part(part_type: str, value: Any) -> bytes:
    """Formats a part according to the Vercel AI SDK Data Stream protocol."""
    prefix_map = {
        "text": "0",
        "error": "3",
        "finish_message": "d",
        "tool_call": "1", # Use standard Vercel AI SDK prefix for function/tool calls
        # TODO: Add other prefixes if needed later (tool_result 'a', data '2', etc.)
    }
    code = prefix_map.get(part_type)
    if code is None:
        logger.error(f"Unknown stream part type requested for formatting: {part_type}")
        return b"" # Return empty bytes for unknown types

    # Format: CODE:JSON_VALUE\n
    # We must encode the value as a JSON string.
    try:
        json_value = json.dumps(value)
        formatted_string = f"{code}:{json_value}\n"
        return formatted_string.encode('utf-8')
    except Exception as e:
        logger.error(f"Failed to format stream part type {part_type} with value {value}: {e}")
        # Fallback: format an error part instead
        try:
            error_payload = {"error": f"Failed to format stream part: {part_type}"}
            error_string = f"3:{json.dumps(error_payload)}\n"
            return error_string.encode('utf-8')
        except:
            # Ultimate fallback if error formatting fails
            return b'3:{"error":"Internal formatting error"}\n'

# --- AI Client Initialization --- #

# Configure Standard OpenAI Client
openai_client = None
if OPENAI_API_KEY:
    try:
        openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY, timeout=30.0)
        logger.info("OpenAI client initialized.")
    except Exception as e:
        logger.exception("Failed to initialize OpenAI client")

# Configure Google Client using OpenAI Compatibility Layer
google_openai_client = None
if GOOGLE_API_KEY:
    try:
        google_openai_client = AsyncOpenAI(
            api_key=GOOGLE_API_KEY,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/", 
            timeout=60.0 # Google might need longer timeout
        )
        logger.info("Google client initialized (via OpenAI library compatibility).")
    except Exception as e:
        logger.exception("Failed to initialize Google client via OpenAI library")

# --- Cache Key Generation --- #
def generate_cache_key(
    base_model_id: str,
    messages: list[dict[str, Any]],
    system_prompt: str | None,
    tools: list[dict[str, Any]] | None,
    tool_choice: str | dict | None
) -> str:
    """Generates a stable cache key from LLM request parameters."""
    payload = {
        "model": base_model_id,
        "messages": messages,
        "system": system_prompt,
        "tools": tools,
        "tool_choice": tool_choice,
        # Add other deterministic parameters like temperature if used
    }
    # Use sort_keys=True for stable JSON string for hashing
    serialized_payload = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(serialized_payload.encode('utf-8')).hexdigest()

# --- Generic Streaming Function --- #

async def stream_openai_compatible_response(
    client: AsyncOpenAI,
    base_model_id: str,
    messages: list[dict[str, Any]],
    system_prompt: str | None,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict | None = "auto", # Allow dict for tool_choice
) -> AsyncGenerator[bytes, None]:
    """Streams response chunks, using cache if available."""

    # Generate cache key
    cache_key = generate_cache_key(
        base_model_id,
        messages,
        system_prompt,
        tools,
        tool_choice
    )
    logger.info(f"Generated cache key: {cache_key} for model: {base_model_id}")

    # Check cache
    if cache_key in llm_cache:
        logger.info(f"CACHE HIT for key: {cache_key}")
        try:
            cached_chunks = llm_cache[cache_key]
            for chunk in cached_chunks:
                yield chunk
                await asyncio.sleep(0) # Yield control briefly
            return # End execution after yielding cached data
        except Exception as e:
            logger.error(f"Error retrieving from cache key {cache_key}: {e}")
            # Yield an error message if cache retrieval fails
            error_msg = format_stream_part("error", "Internal server error retrieving cached response.")
            yield error_msg
            # Optionally, clear the potentially corrupt cache entry
            # del llm_cache[cache_key]
            raise CacheError(f"Failed to retrieve valid data from cache key {cache_key}") from e

    logger.info(f"CACHE MISS for key: {cache_key}. Calling API.")

    # Cache miss - proceed with API call and store results
    response_chunks_to_cache: List[bytes] = []

    # --- Original API call logic --- #
    api_messages = []
    if system_prompt:
        api_messages.append({"role": "system", "content": system_prompt})
    api_messages.extend(messages)

    finish_reason = "unknown"
    completion_tokens = 0
    prompt_tokens = 0
    # --- Tool call buffering ---
    tool_call_buffers: Dict[str, Dict[str, Any]] = {}  # internal_id -> {name, args_buffer, original_id}
    tool_call_order: list = []  # Stores internal_ids in order
    current_tool_call_id: str | None = None # Tracks internal_id being streamed
    tool_call_internal_index: int = 0 # Counter for generating internal IDs

    try:
        call_params = {
            "model": base_model_id,
            "messages": api_messages,
            "stream": True,
            "stream_options": {"include_usage": True}
        }
        if tools:
            call_params["tools"] = tools
            call_params["tool_choice"] = tool_choice

        stream = await client.chat.completions.create(**call_params)
        logger.info(f"Stream initiated for model {base_model_id} with {client.base_url}")

        async for chunk in stream:
            logger.info(f"[{base_model_id}]: {chunk}")
            choice = chunk.choices[0] if chunk.choices else None
            chunk_finish_reason = None

            if choice:
                delta = choice.delta

                # Accumulate Text Content
                if delta and delta.content:
                    formatted_part = format_stream_part("text", delta.content)
                    yield formatted_part
                    response_chunks_to_cache.append(formatted_part)

                # Accumulate Tool Calls (Revised Logic)
                if delta and delta.tool_calls:
                    for tool_call_chunk in delta.tool_calls:
                        # Extract details (might be None)
                        chunk_id = tool_call_chunk.id
                        chunk_name = tool_call_chunk.function.name if tool_call_chunk.function else None
                        chunk_args = tool_call_chunk.function.arguments if tool_call_chunk.function else None

                        # Determine the internal ID for buffering
                        internal_id = None
                        is_new_tool_call_start = bool(chunk_name) # Assume new call starts when name appears

                        if is_new_tool_call_start:
                            received_id = chunk_id
                            if received_id: # Use provider ID if available
                                internal_id = received_id
                            else: # Generate internal ID if provider ID is missing/empty
                                internal_id = f"generated_{tool_call_internal_index}"
                                tool_call_internal_index += 1
                            
                            # Update tracker for subsequent fragments
                            current_tool_call_id = internal_id 
                            
                            # Initialize buffer if this internal_id hasn't been seen
                            if internal_id not in tool_call_buffers:
                                logger.info(f"[TOOLCALL BUFFER] New tool call started. internal_id={internal_id}, original_id={received_id!r}, name={chunk_name}")
                                tool_call_buffers[internal_id] = {"name": chunk_name, "args_buffer": "", "original_id": received_id}
                                tool_call_order.append(internal_id) # Add to order only once
                            else:
                                # If internal_id (from a valid received_id) repeats, update name if needed (rare)
                                if tool_call_buffers[internal_id]["name"] != chunk_name:
                                     logger.warning(f"[TOOLCALL BUFFER] Tool call ID {internal_id} repeated with different name ('{chunk_name}' vs '{tool_call_buffers[internal_id]['name']}'). Using new name.")
                                     tool_call_buffers[internal_id]["name"] = chunk_name
                        
                        # Determine target buffer for appending args
                        target_id_for_args = None
                        if is_new_tool_call_start:
                            target_id_for_args = internal_id # Append to the new/updated buffer
                        elif chunk_args and not chunk_id and not chunk_name: # Argument fragment
                             if current_tool_call_id:
                                 target_id_for_args = current_tool_call_id
                             else:
                                 logger.warning(f"[TOOLCALL BUFFER] Received args fragment '{chunk_args!r}' but no current tool call ID is set. Ignoring fragment.")
                        # Add handling for other chunk types if necessary (e.g., only ID, only Name)

                        # Append arguments if we have a target ID and args exist
                        if target_id_for_args and chunk_args:
                             if target_id_for_args not in tool_call_buffers:
                                 logger.error(f"[TOOLCALL BUFFER] Logic error: target_id_for_args '{target_id_for_args}' not found in buffers. Args: {chunk_args!r}")
                             else:
                                 tool_call_buffers[target_id_for_args]["args_buffer"] += chunk_args
                                 # Optional: Add back detailed logging if needed
                                 # logger.info(f"[TOOLCALL BUFFER] Fragment appended to internal_id={target_id_for_args}. Current buffer: {tool_call_buffers[target_id_for_args]['args_buffer']!r}")

                # Store Finish Reason
                if choice.finish_reason:
                    chunk_finish_reason = choice.finish_reason
                    finish_reason = chunk_finish_reason
                    logger.info(f"Received finish_reason='{chunk_finish_reason}' in chunk for {base_model_id}")

            # Handle Usage
            if chunk.usage:
                logger.info(f"Received usage information for {base_model_id}: {chunk.usage}")
                prompt_tokens = chunk.usage.prompt_tokens if chunk.usage.prompt_tokens is not None else 0
                completion_tokens = chunk.usage.completion_tokens if chunk.usage.completion_tokens is not None else 0

        # End of stream loop
        logger.info(f"Finished iterating stream for {base_model_id}. Final finish_reason='{finish_reason}'")

        # Process Accumulated Tool Calls AFTER the loop
        if finish_reason == "tool_calls":
            logger.info(f"Processing accumulated tool calls for {base_model_id} after stream finished...")
            for index, internal_id in enumerate(tool_call_order):
                tc_data = tool_call_buffers[internal_id]
                try:
                    original_args_string = tc_data.get("args_buffer", "{}")
                    final_tool_call_id = tc_data.get("original_id") or internal_id # Use original ID if present, else generated ID
                    
                    logger.info(f"[TOOLCALL ASSEMBLED] internal_id={internal_id}, name={tc_data['name']}, payload_id={final_tool_call_id!r}, args={original_args_string!r}")
                    
                    if not isinstance(original_args_string, str):
                        original_args_string = json.dumps(original_args_string)
                        
                    tool_call_payload = {
                        "id": final_tool_call_id, # Use original or generated ID for payload
                        "function_call": {
                            "name": tc_data["name"],
                            "arguments": original_args_string
                        }
                    }
                    logger.info(f"[TOOLCALL YIELD] Payload: {tool_call_payload}")
                    formatted_part = format_stream_part("tool_call", tool_call_payload)
                    yield formatted_part
                    response_chunks_to_cache.append(formatted_part)
                except Exception as e:
                    logger.error(f"Error formatting payload for tool call {tc_data['name']} (internal ID: {internal_id}): {e}", exc_info=True)
                    formatted_part = format_stream_part("error", f"Internal error formatting tool call {tc_data['name']}.")
                    yield formatted_part
                    response_chunks_to_cache.append(formatted_part)

    # Consolidated Error Handling - applies to both OpenAI and Google-via-OpenAI calls
    except NotFoundError as e:
        logger.error(f"API Error (404 Model Not Found) for model {base_model_id} using {client.base_url}: {e}")
        error_message = f"Error: The model '{base_model_id}' was not found or is inaccessible."
        formatted_part = format_stream_part("error", error_message)
        yield formatted_part
        response_chunks_to_cache.append(formatted_part)
        finish_reason = "error"
    except httpx.TimeoutException as e:
        logger.error(f"httpx.TimeoutException during stream for model {base_model_id} using {client.base_url}: {e}")
        error_message = f"Error: The request to the AI service timed out."
        formatted_part = format_stream_part("error", error_message)
        yield formatted_part
        response_chunks_to_cache.append(formatted_part)
        finish_reason = "error"
    except httpx.ConnectError as e:
        logger.error(f"httpx.ConnectError during stream for model {base_model_id} using {client.base_url}: {e}")
        error_message = f"Error: Could not connect to the AI service ({client.base_url})."
        formatted_part = format_stream_part("error", error_message)
        yield formatted_part
        response_chunks_to_cache.append(formatted_part)
        finish_reason = "error"
    except APIConnectionError as e:
        logger.error(f"API Connection Error for model {base_model_id} using {client.base_url}: {e}")
        error_message = f"Error: Could not connect to the AI service ({client.base_url})."
        formatted_part = format_stream_part("error", error_message)
        yield formatted_part
        response_chunks_to_cache.append(formatted_part)
        finish_reason = "error"
    except RateLimitError as e: # Handles 429 errors from both
        logger.error(f"Rate Limit Error for model {base_model_id} using {client.base_url}: {e}")
        error_message = "Error: AI service rate limit exceeded. Please try again later."
        formatted_part = format_stream_part("error", error_message)
        yield formatted_part
        response_chunks_to_cache.append(formatted_part)
        finish_reason = "error"
    except APIStatusError as e: # Handles other non-2xx errors
        logger.error(f"API Status Error for model {base_model_id} ({e.status_code}) using {client.base_url}: {e}")
        error_message = f"Error: The AI service returned an error (Status {e.status_code})."
        formatted_part = format_stream_part("error", error_message)
        yield formatted_part
        response_chunks_to_cache.append(formatted_part)
        finish_reason = "error"
    except Exception as e:
        logger.exception(f"Unexpected error during stream for model {base_model_id} using {client.base_url}")
        error_message = f"Error: An unexpected error occurred processing the AI response."
        formatted_part = format_stream_part("error", error_message)
        yield formatted_part
        response_chunks_to_cache.append(formatted_part)
        finish_reason = "error"
    finally:
        # Always format and append the finish message (unless finished cleanly with tool_calls)
        logger.info(f"Entering finally block. Final finish_reason='{finish_reason}'")
        if finish_reason != "tool_calls":
            logger.info(f"Yielding final finish_message part (reason: {finish_reason})")
            finish_payload = {
                "finishReason": finish_reason,
                "usage": {
                    "promptTokens": prompt_tokens,
                    "completionTokens": completion_tokens
                }
            }
            formatted_part = format_stream_part("finish_message", finish_payload)
            yield formatted_part
            response_chunks_to_cache.append(formatted_part)
        else:
             logger.info(f"Skipping final finish_message part because finish_reason was tool_calls.")

        # --- Store results in cache AFTER yielding everything --- #
        if response_chunks_to_cache: # Only cache if we actually got something
            logger.info(f"Storing {len(response_chunks_to_cache)} response chunks in cache for key: {cache_key}")
            llm_cache[cache_key] = response_chunks_to_cache

# --- Main Routing Function --- #

async def stream_ai_response(
    provider: str,
    base_model_id: str,
    messages: List[Dict[str, Any]],
    system_prompt: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict | None = "auto", # Allow dict
) -> AsyncGenerator[bytes, None]:
    """Determines the provider and streams the response using OpenAI-compatible clients."""
    logger.info(f"Streaming request for Provider: {provider}, Model: {base_model_id}")

    client: AsyncOpenAI | None = None
    if provider == "openai" and openai_client:
        client = openai_client
    elif provider == "google" and google_openai_client:
        # Use the Google client configured with OpenAI compatibility layer
        client = google_openai_client
    # Add other providers like XAI here if needed
    # elif provider == "xai" and xai_client:
    #     client = xai_client

    if not client:
        error_msg = f"Provider '{provider}' is not configured or supported."
        logger.error(error_msg)
        yield format_stream_part("error", error_msg)
        # Yield a finish message for error
        yield format_stream_part("finish_message", {"finishReason": "error", "usage": {"promptTokens": 0, "completionTokens": 0}})
        return # Stop generation

    # Use the selected client to stream the response
    try:
        async for chunk in stream_openai_compatible_response(
            client=client,
            base_model_id=base_model_id, # Pass base_model_id here
            messages=messages,
            system_prompt=system_prompt,
            tools=tools,
            tool_choice=tool_choice,
        ):
            yield chunk
    except CacheError as e:
        logger.error(f"Cache error during streaming: {e}")
        # The error message should have already been yielded by stream_openai_compatible_response
        # Yield finish message if not already done
        yield format_stream_part("finish_message", {"finishReason": "error", "usage": {"promptTokens": 0, "completionTokens": 0}})

    except Exception as e:
        logger.exception(f"Unexpected error during streaming for {provider} - {base_model_id}")
        error_msg = f"An unexpected error occurred: {str(e)}"
        yield format_stream_part("error", error_msg)
        yield format_stream_part("finish_message", {"finishReason": "error", "usage": {"promptTokens": 0, "completionTokens": 0}})

# --- Title Generation Service --- #
async def generate_title(provider: str, base_model_id: str, prompt: str) -> str:
    """Generates a concise title for a chat based on the initial prompt."""
    logger.info(f"Generating title for Provider: {provider}, Model: {base_model_id}")

    client: AsyncOpenAI | None = None
    if provider == "openai" and openai_client:
        client = openai_client
    elif provider == "google" and google_openai_client:
        client = google_openai_client
    # Add other providers if needed

    if not client:
        error_msg = f"Provider '{provider}' is not configured or supported for title generation."
        logger.error(error_msg)
        raise ProviderError(error_msg)

    # Define a system prompt for title generation
    title_system_prompt = (
        "You are an expert at creating concise, relevant titles for chat conversations. "
        "Based on the following user message, generate a short title (max 5 words) "
        "that accurately reflects the main topic. Do not include quotation marks or labels like 'Title:'."
    )

    try:
        response = await client.chat.completions.create(
            model=base_model_id, # Use the base model ID
            messages=[
                {"role": "system", "content": title_system_prompt},
                {"role": "user", "content": prompt}
            ],
            #max_tokens=50,  # Limit title length
            temperature=0.3, # Lower temperature for less creative titles
            stream=False,
        )
        # Check if content exists before stripping
        content = response.choices[0].message.content
        if content:
            title = content.strip()
            # Optional: Basic cleaning (remove quotes etc.) if model still adds them
            title = title.replace("\"", "").replace("'", "")
            logger.info(f"Generated title: '{title}' for {provider} - {base_model_id}")
            return title if title else "Chat" # Return cleaned title or default
        else:
            logger.warning(f"Title generation for {provider} - {base_model_id} returned empty content.")
            return "Chat" # Return default title if content is None or empty

    except NotFoundError as e:
        logger.error(f"API Error (404 Model Not Found) for title gen: {provider} - {base_model_id}: {e}")
        raise ModelNotFoundError(f"Model '{base_model_id}' not found for provider '{provider}'.") from e
    except (RateLimitError, APIConnectionError, APIStatusError, httpx.TimeoutException, httpx.ConnectError) as e:
        logger.error(f"API/Network error during title generation for {provider} - {base_model_id}: {e}")
        raise ProviderError(f"API or Network error contacting provider '{provider}': {e}") from e
    except Exception as e:
        logger.exception(f"Unexpected error during title generation for {provider} - {base_model_id}")
        raise # Re-raise unexpected errors
