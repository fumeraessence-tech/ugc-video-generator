"""Pytest configuration and fixtures for the test suite."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    """Create an async HTTP client for testing the FastAPI application.

    Uses ASGITransport to directly communicate with the FastAPI app
    without requiring a running server.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


@pytest.fixture
def anyio_backend():
    """Configure pytest-asyncio to use asyncio as the async backend."""
    return "asyncio"
