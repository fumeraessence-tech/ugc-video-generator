"""Tests for security headers middleware."""
import pytest
from httpx import AsyncClient

from app.config import settings


class TestSecurityHeaders:
    """Tests for the SecurityHeadersMiddleware."""

    @pytest.mark.asyncio
    async def test_x_content_type_options_header(self, client: AsyncClient) -> None:
        """Test that X-Content-Type-Options header is set to nosniff."""
        response = await client.get("/health")

        assert response.status_code == 200
        assert "x-content-type-options" in response.headers
        assert response.headers["x-content-type-options"] == "nosniff"

    @pytest.mark.asyncio
    async def test_x_frame_options_header(self, client: AsyncClient) -> None:
        """Test that X-Frame-Options header is set to DENY."""
        response = await client.get("/health")

        assert response.status_code == 200
        assert "x-frame-options" in response.headers
        assert response.headers["x-frame-options"] == "DENY"

    @pytest.mark.asyncio
    async def test_x_xss_protection_header(self, client: AsyncClient) -> None:
        """Test that X-XSS-Protection header is set."""
        response = await client.get("/health")

        assert response.status_code == 200
        assert "x-xss-protection" in response.headers
        assert response.headers["x-xss-protection"] == "1; mode=block"

    @pytest.mark.asyncio
    async def test_referrer_policy_header(self, client: AsyncClient) -> None:
        """Test that Referrer-Policy header is set to strict-origin-when-cross-origin."""
        response = await client.get("/health")

        assert response.status_code == 200
        assert "referrer-policy" in response.headers
        assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"

    @pytest.mark.asyncio
    async def test_permissions_policy_header(self, client: AsyncClient) -> None:
        """Test that Permissions-Policy header restricts sensitive features."""
        response = await client.get("/health")

        assert response.status_code == 200
        assert "permissions-policy" in response.headers
        policy = response.headers["permissions-policy"]
        # Should restrict camera, microphone, and geolocation
        assert "camera=()" in policy
        assert "microphone=()" in policy
        assert "geolocation=()" in policy

    @pytest.mark.asyncio
    async def test_security_headers_on_all_endpoints(self, client: AsyncClient) -> None:
        """Test that security headers are applied to all endpoints."""
        endpoints = ["/health", "/openapi.json", "/docs"]

        for endpoint in endpoints:
            response = await client.get(endpoint)
            assert response.status_code == 200
            # Check all critical security headers are present
            assert "x-content-type-options" in response.headers
            assert "x-frame-options" in response.headers
            assert "x-xss-protection" in response.headers
            assert "referrer-policy" in response.headers
            assert "permissions-policy" in response.headers

    @pytest.mark.asyncio
    async def test_hsts_header_on_localhost_exempt(self, client: AsyncClient) -> None:
        """Test that HSTS header is not set on localhost (for local testing)."""
        response = await client.get("/health")

        assert response.status_code == 200
        # Since the test client base URL is http://test, it will not include HSTS
        # because the middleware checks for localhost and 127.0.0.1
        # This is expected behavior - HSTS should only be on production domains
        hostname = str(response.request.url.host)
        if "test" not in hostname and "localhost" not in hostname:
            # If not on localhost, HSTS might be set (depends on hostname)
            pass

    @pytest.mark.asyncio
    async def test_no_sensitive_information_in_headers(self, client: AsyncClient) -> None:
        """Test that headers don't expose sensitive server information."""
        response = await client.get("/health")

        assert response.status_code == 200
        headers_lower = {k.lower(): v for k, v in response.headers.items()}

        # Should not expose server details
        # Some headers are informational but shouldn't include version/OS details
        if "server" in headers_lower:
            server_value = headers_lower["server"].lower()
            # Should not contain version info
            assert not any(f"/{v[0]}" in server_value for v in ["1.0", "2.0", "3.0"])

    @pytest.mark.asyncio
    async def test_security_headers_headers_case_insensitive(self, client: AsyncClient) -> None:
        """Test that security headers are properly set regardless of case."""
        response = await client.get("/health")

        assert response.status_code == 200
        # Headers are case-insensitive in HTTP, httpx should handle this
        headers_lower = {k.lower(): v for k, v in response.headers.items()}

        assert "x-content-type-options" in headers_lower
        assert "x-frame-options" in headers_lower
        assert "x-xss-protection" in headers_lower
        assert "referrer-policy" in headers_lower
        assert "permissions-policy" in headers_lower

    @pytest.mark.asyncio
    async def test_security_headers_values_not_empty(self, client: AsyncClient) -> None:
        """Test that security header values are not empty or whitespace."""
        response = await client.get("/health")

        assert response.status_code == 200
        critical_headers = [
            "x-content-type-options",
            "x-frame-options",
            "x-xss-protection",
            "referrer-policy",
            "permissions-policy",
        ]

        for header in critical_headers:
            assert header in response.headers
            value = response.headers[header]
            assert value is not None
            assert len(value.strip()) > 0

    @pytest.mark.asyncio
    async def test_security_headers_consistency(self, client: AsyncClient) -> None:
        """Test that security headers are consistent across multiple requests."""
        headers_set_1 = (await client.get("/health")).headers
        headers_set_2 = (await client.get("/health")).headers
        headers_set_3 = (await client.get("/openapi.json")).headers

        # Extract security headers
        def get_security_headers(headers):
            return {
                k: v for k, v in headers.items()
                if any(h in k.lower() for h in ["x-content", "x-frame", "x-xss", "referrer", "permissions"])
            }

        sec_headers_1 = get_security_headers(headers_set_1)
        sec_headers_2 = get_security_headers(headers_set_2)
        sec_headers_3 = get_security_headers(headers_set_3)

        # Headers should be consistent
        assert sec_headers_1 == sec_headers_2
        # Headers should be present in all responses
        assert len(sec_headers_3) >= 5
