import pytest
import httpx
from unittest.mock import patch, MagicMock, AsyncMock
from typing import AsyncGenerator
import asyncio

# Assuming Pydantic models are defined in app.api or accessible
# Adjust import if needed
from app.api import StreamRequest, TitleRequest, MessageInput 

pytestmark = pytest.mark.asyncio

# --- Mocking Fixtures/Helpers --- #

async def mock_stream_generator(chunks: list[bytes]) -> AsyncGenerator[bytes, None]:
    """Helper to create a mock async generator."""
    for chunk in chunks:
        yield chunk
        await asyncio.sleep(0)

# --- Test Cases --- #

async def test_generate_title_success(client: httpx.AsyncClient, mocker):
    """Tests successful title generation."""
    # Mock the service function
    mock_service_call = mocker.patch(
        'app.services.generate_title',
        return_value="Mocked Test Title"
    )
    
    payload = {
        "model_id": "openai-gpt-4o",
        "prompt": "Test prompt for title"
    }
    
    response = await client.post("/api/v1/generate/title", json=payload)
    
    assert response.status_code == 200
    assert response.json() == {"title": "Mocked Test Title"}
    mock_service_call.assert_called_once_with(
        model_id="openai-gpt-4o",
        prompt="Test prompt for title"
    )

async def test_generate_title_error(client: httpx.AsyncClient, mocker):
    """Tests title generation when service raises an error."""
    # Mock the service function to raise an error
    mock_service_call = mocker.patch(
        'app.services.generate_title',
        side_effect=Exception("Service Error")
    )
    
    payload = {
        "model_id": "openai-gpt-4o",
        "prompt": "Test prompt for title"
    }
    
    response = await client.post("/api/v1/generate/title", json=payload)
    
    assert response.status_code == 500
    assert "Failed to generate title: Service Error" in response.text
    mock_service_call.assert_awaited_once()

async def test_generate_stream_success(client: httpx.AsyncClient, mocker):
    """Tests successful stream generation."""
    mock_chunks = [b"Hello", b" ", b"world!"]
    
    # Mock the service stream generator
    mock_service_stream = mocker.patch(
        'app.services.stream_ai_response',
        return_value=mock_stream_generator(mock_chunks)
    )
    
    payload = {
        "model_id": "openai-gpt-4o",
        "messages": [{"role": "user", "content": "Hello"}],
        "system_prompt": "Be helpful"
    }
    
    response = await client.post("/api/v1/generate/stream", json=payload)
    
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/plain; charset=utf-8"
    
    received_content = b""
    async for chunk in response.aiter_bytes():
        received_content += chunk
        
    assert received_content == b"Hello world!"
    
    mock_service_stream.assert_called_once_with(
        model_id="openai-gpt-4o",
        messages=[{'role': 'user', 'content': 'Hello'}],
        system_prompt="Be helpful"
    )

async def test_generate_stream_service_error(client: httpx.AsyncClient, mocker):
    """Tests stream generation when the service itself yields an error."""
    error_message = b"Error: Test Service Error"
    mock_chunks = [error_message]
    
    # Mock the service stream generator to yield an error message
    mock_service_stream = mocker.patch(
        'app.services.stream_ai_response',
        return_value=mock_stream_generator(mock_chunks)
    )
    
    payload = {
        "model_id": "openai-gpt-4o",
        "messages": [{"role": "user", "content": "Hello"}],
        "system_prompt": "Be helpful"
    }
    
    response = await client.post("/api/v1/generate/stream", json=payload)
    
    assert response.status_code == 200
    
    received_content = b""
    async for chunk in response.aiter_bytes():
        received_content += chunk
        
    assert received_content == error_message
    
    mock_service_stream.assert_called_once()
