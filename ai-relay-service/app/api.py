from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import asyncio
import logging # Import logging

from . import services # Import the service functions

logger = logging.getLogger(__name__) # Get logger for this module

router = APIRouter()

# --- Pydantic Models for Request Validation --- #

class MessageInput(BaseModel):
    # Define structure expected from Next.js
    # This should align with Vercel AI SDK's message format (or how you adapt it)
    role: str
    content: str # Or potentially Dict/List for complex content
    # Add other fields like 'name', 'tool_calls' if Next.js sends them

# Added Tool Definition Model (matching OpenAI format)
class ToolFunctionDefinition(BaseModel):
    name: str
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None # Represents JSON Schema object

class ToolDefinition(BaseModel):
    type: str = "function"
    function: ToolFunctionDefinition

class StreamRequest(BaseModel):
    provider: str
    model_id: str = Field(..., alias="base_model_id")  # Rename incoming field
    messages: list[dict]
    stream: bool = True
    system_prompt: str | None = None
    tools: list[dict] | None = None
    tool_choice: str | dict | None = None
    max_tokens: int | None = None
    temperature: float | None = None
    top_p: float | None = None
    # Add other OpenAI compatible parameters as needed

class TitleRequest(BaseModel):
    provider: str
    base_model_id: str
    prompt: str

# --- API Endpoints --- #

@router.post("/generate/stream", tags=["AI Generation"])
async def generate_stream_endpoint(request: StreamRequest):
    """
    Receives chat messages and streams back the AI provider's response.
    """
    logger.info(f"Received stream request for Provider: {request.provider}, Model: {request.model_id} with tools: {request.tools is not None}")
    try:
        # Messages and tools are already dicts based on StreamRequest
        messages_dict_list = request.messages
        tools_list = request.tools # This is already list[dict] or None

        async def event_generator():
            try:
                service_stream = services.stream_ai_response(
                    provider=request.provider,
                    base_model_id=request.model_id, # Use model_id (aliased from base_model_id)
                    messages=messages_dict_list,
                    system_prompt=request.system_prompt,
                    tools=tools_list,
                    tool_choice=request.tool_choice
                )
                logger.info("Event generator started, entering async for loop...")
                async for chunk_bytes in service_stream:
                    # Log bytes received from the service generator
                    logger.info(f"Event generator received bytes: {chunk_bytes[:100]}...")
                    if chunk_bytes:
                        # Log BEFORE yielding to response stream
                        logger.info(f"Event generator yielding bytes to response: {chunk_bytes[:100]}...")
                        yield chunk_bytes
                        # Log AFTER yielding to response stream
                        logger.info(f"Event generator finished yielding bytes to response.")
                    else:
                        logger.warning("Event generator received empty chunk_bytes from service.")
                    await asyncio.sleep(0)
                logger.info(f"Event generator finished async for loop for Provider: {request.provider}, Model: {request.model_id}")
            except Exception as e:
                logger.error(f"Error within event_generator: {e}", exc_info=True)
                try:
                     yield services.format_stream_part("error", f"Internal streaming error: {e}")
                     yield services.format_stream_part("finish_message", {"finishReason": "error", "usage": {"promptTokens": 0, "completionTokens": 0}})
                except:
                     yield b'3:{"error":"Internal generator error"}\n'
                     yield b'd:{"finishReason":"error","usage":{"promptTokens":0,"completionTokens":0}}\n'

        return StreamingResponse(event_generator(), media_type="text/plain; charset=utf-8")

    except Exception as e:
        logger.exception(f"Failed to start stream processing for Provider: {request.provider}, Model: {request.model_id}")
        raise HTTPException(status_code=500, detail=f"Failed to process stream request: {str(e)}")

@router.post("/generate/title", tags=["AI Generation"])
async def generate_chat_title(request: TitleRequest):
    logger.info(
        f"Received title generation request for provider '{request.provider}', model '{request.base_model_id}'"
    )
    try:
        title = await services.generate_title(
            provider=request.provider,
            base_model_id=request.base_model_id,
            prompt=request.prompt,
        )
        return {"title": title}
    # Use the exceptions defined in services
    except (services.ProviderError, services.ModelNotFoundError) as e:
        logger.error(f"Error generating title: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except services.CacheError as e: # Added CacheError handling
        logger.error(f"Cache error during title generation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error related to caching.")
    except Exception as e:
        logger.exception("An unexpected error occurred during title generation")
        raise HTTPException(status_code=500, detail="Internal Server Error")
