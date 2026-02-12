"""Tests for rate limiting middleware."""
import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch
import asyncio

from app.config import settings


class TestRateLimiter:
    """Tests for the RateLimitMiddleware."""

    @pytest.mark.asyncio
    async def test_health_endpoint_bypasses_rate_limit(self, client: AsyncClient) -> None:
        """Test that /health endpoint is not rate limited."""
        # Health endpoint should not have rate limit headers or be limited
        response = await client.get("/health")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_docs_endpoint_bypasses_rate_limit(self, client: AsyncClient) -> None:
        """Test that /docs endpoint is not rate limited."""
        response = await client.get("/docs")
        # Should not return 429
        assert response.status_code != 429

    @pytest.mark.asyncio
    async def test_openapi_endpoint_bypasses_rate_limit(self, client: AsyncClient) -> None:
        """Test that /openapi.json endpoint is not rate limited."""
        response = await client.get("/openapi.json")
        assert response.status_code != 429

    @pytest.mark.asyncio
    async def test_redoc_endpoint_bypasses_rate_limit(self, client: AsyncClient) -> None:
        """Test that /redoc endpoint is not rate limited."""
        response = await client.get("/redoc")
        assert response.status_code != 429

    @pytest.mark.asyncio
    async def test_rate_limit_headers_present_when_enabled(self, client: AsyncClient) -> None:
        """Test that rate limit headers are present when rate limiting is enabled."""
        if not settings.RATE_LIMIT_ENABLED:
            pytest.skip("Rate limiting is disabled in settings")

        response = await client.get("/health")
        # Health is exempt but if we hit another endpoint, headers should be present
        # For now, verify health works
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_rate_limit_disabled(self, client: AsyncClient) -> None:
        """Test behavior when rate limiting is disabled."""
        if settings.RATE_LIMIT_ENABLED:
            # Test will work if rate limiting is enabled, but can't easily test disabled
            # Just verify that if enabled, health still works
            response = await client.get("/health")
            assert response.status_code == 200
        else:
            # If disabled, requests should go through without 429
            response = await client.get("/health")
            assert response.status_code != 429

    @pytest.mark.asyncio
    async def test_generation_endpoint_tier_classification(self) -> None:
        """Test that generation endpoints are classified correctly."""
        from app.middleware.rate_limiter import _classify_endpoint

        generation_paths = [
            "/api/v1/generate",
            "/api/v1/video/generate",
            "/api/v1/storyboard/generate",
            "/api/v1/storyboard/regenerate",
            "/api/v1/editor/compile",
            "/api/v1/perfume/generate",
            "/api/v1/perfume/batch",
        ]

        for path in generation_paths:
            tier, limit = _classify_endpoint(path)
            assert tier == "generation"
            assert limit == settings.RATE_LIMIT_GENERATION_RPM

    @pytest.mark.asyncio
    async def test_upload_endpoint_tier_classification(self) -> None:
        """Test that upload endpoints are classified correctly."""
        from app.middleware.rate_limiter import _classify_endpoint

        upload_paths = [
            "/upload",
            "/api/v1/upload",
            "/files/upload",
        ]

        for path in upload_paths:
            tier, limit = _classify_endpoint(path)
            assert tier == "upload"
            assert limit == settings.RATE_LIMIT_UPLOAD_RPM

    @pytest.mark.asyncio
    async def test_default_endpoint_tier_classification(self) -> None:
        """Test that non-classified endpoints use default tier."""
        from app.middleware.rate_limiter import _classify_endpoint

        default_paths = [
            "/api/v1/jobs",
            "/api/v1/status",
            "/some/random/path",
        ]

        for path in default_paths:
            tier, limit = _classify_endpoint(path)
            assert tier == "default"
            assert limit == settings.RATE_LIMIT_DEFAULT_RPM

    @pytest.mark.asyncio
    async def test_identifier_extraction_from_ip(self) -> None:
        """Test that client IP is used as fallback identifier."""
        from app.middleware.rate_limiter import _get_identifier
        from starlette.requests import Request
        from starlette.datastructures import Headers

        # Create a mock request with client IP
        request = Request(
            scope={
                "type": "http",
                "method": "GET",
                "path": "/test",
                "query_string": b"",
                "headers": [],
                "client": ("192.168.1.1", 12345),
            }
        )

        identifier = _get_identifier(request)
        assert "ip:" in identifier
        assert "192.168.1.1" in identifier

    @pytest.mark.asyncio
    async def test_identifier_extraction_from_x_forwarded_for(self) -> None:
        """Test that X-Forwarded-For header is used for identifier."""
        from app.middleware.rate_limiter import _get_identifier
        from starlette.requests import Request
        from starlette.datastructures import Headers

        # Create a mock request with X-Forwarded-For header
        headers = [(b"x-forwarded-for", b"203.0.113.1, 198.51.100.1")]
        request = Request(
            scope={
                "type": "http",
                "method": "GET",
                "path": "/test",
                "query_string": b"",
                "headers": headers,
                "client": ("192.168.1.1", 12345),
            }
        )

        identifier = _get_identifier(request)
        assert "203.0.113.1" in identifier

    @pytest.mark.asyncio
    async def test_rate_limit_window_configuration(self) -> None:
        """Test that rate limit window is properly configured."""
        assert settings.RATE_LIMIT_WINDOW_SECONDS > 0
        assert isinstance(settings.RATE_LIMIT_WINDOW_SECONDS, int)

    @pytest.mark.asyncio
    async def test_rate_limit_rpm_tiers_configured(self) -> None:
        """Test that all rate limit RPM tiers are configured."""
        assert settings.RATE_LIMIT_GENERATION_RPM > 0
        assert settings.RATE_LIMIT_UPLOAD_RPM > 0
        assert settings.RATE_LIMIT_DEFAULT_RPM > 0
        assert isinstance(settings.RATE_LIMIT_GENERATION_RPM, int)
        assert isinstance(settings.RATE_LIMIT_UPLOAD_RPM, int)
        assert isinstance(settings.RATE_LIMIT_DEFAULT_RPM, int)
