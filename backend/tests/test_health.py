"""Tests for health check and OpenAPI schema endpoints."""
import pytest
from httpx import AsyncClient

from app.config import settings


class TestHealthCheck:
    """Tests for the /health endpoint."""

    @pytest.mark.asyncio
    async def test_health_check_success(self, client: AsyncClient) -> None:
        """Test that the health check endpoint returns 200 with correct status."""
        response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["version"] == settings.APP_VERSION

    @pytest.mark.asyncio
    async def test_health_check_response_headers(self, client: AsyncClient) -> None:
        """Test that health check includes standard response headers."""
        response = await client.get("/health")

        assert response.status_code == 200
        assert "content-type" in response.headers
        assert response.headers["content-type"] == "application/json"

    @pytest.mark.asyncio
    async def test_health_check_json_structure(self, client: AsyncClient) -> None:
        """Test the JSON structure of the health check response."""
        response = await client.get("/health")

        data = response.json()
        assert isinstance(data, dict)
        assert set(data.keys()) == {"status", "version"}
        assert isinstance(data["status"], str)
        assert isinstance(data["version"], str)


class TestOpenAPISchema:
    """Tests for the OpenAPI schema endpoint."""

    @pytest.mark.asyncio
    async def test_openapi_schema_available(self, client: AsyncClient) -> None:
        """Test that the OpenAPI schema is available at /openapi.json."""
        response = await client.get("/openapi.json")

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"

    @pytest.mark.asyncio
    async def test_openapi_schema_structure(self, client: AsyncClient) -> None:
        """Test the basic structure of the OpenAPI schema."""
        response = await client.get("/openapi.json")

        schema = response.json()
        # Basic OpenAPI structure validation
        assert "openapi" in schema
        assert "info" in schema
        assert "paths" in schema
        assert isinstance(schema["paths"], dict)

    @pytest.mark.asyncio
    async def test_openapi_schema_has_version(self, client: AsyncClient) -> None:
        """Test that OpenAPI schema includes the app version."""
        response = await client.get("/openapi.json")

        schema = response.json()
        assert schema["info"]["version"] == settings.APP_VERSION

    @pytest.mark.asyncio
    async def test_openapi_schema_has_title(self, client: AsyncClient) -> None:
        """Test that OpenAPI schema includes the app title."""
        response = await client.get("/openapi.json")

        schema = response.json()
        assert schema["info"]["title"] == "UGC Video Generator"

    @pytest.mark.asyncio
    async def test_docs_endpoint_available(self, client: AsyncClient) -> None:
        """Test that Swagger UI docs are available at /docs."""
        response = await client.get("/docs")

        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_redoc_endpoint_available(self, client: AsyncClient) -> None:
        """Test that ReDoc is available at /redoc."""
        response = await client.get("/redoc")

        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
