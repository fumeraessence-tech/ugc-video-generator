"""
Supabase Storage service for the backend.
Uses the service role key to bypass RLS for server-side file operations.
"""

import logging
from pathlib import Path

from supabase import create_client

from app.config.settings import Settings

logger = logging.getLogger(__name__)
settings = Settings()


class SupabaseStorageService:
    """Server-side Supabase Storage operations using service role key."""

    def __init__(self):
        if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
            self._client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_ROLE_KEY,
            )
        else:
            self._client = None
            logger.warning("Supabase not configured — storage operations will fail")

    @property
    def client(self):
        if not self._client:
            raise RuntimeError("Supabase client not initialized")
        return self._client

    async def upload_file(
        self,
        bucket: str,
        user_id: str,
        filename: str,
        file_data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload a file and return the public URL."""
        path = f"{user_id}/{filename}"

        self.client.storage.from_(bucket).upload(
            path,
            file_data,
            file_options={"content-type": content_type, "upsert": "true"},
        )

        result = self.client.storage.from_(bucket).get_public_url(path)
        logger.info("Uploaded %s/%s", bucket, path)
        return result

    async def upload_from_path(
        self,
        bucket: str,
        user_id: str,
        local_path: str,
        remote_filename: str | None = None,
    ) -> str:
        """Upload a local file and return the public URL."""
        p = Path(local_path)
        if not p.exists():
            raise FileNotFoundError(f"File not found: {local_path}")

        filename = remote_filename or p.name
        content_type = self._guess_content_type(p.suffix)

        with open(p, "rb") as f:
            file_data = f.read()

        return await self.upload_file(bucket, user_id, filename, file_data, content_type)

    async def delete_file(self, bucket: str, path: str) -> None:
        """Delete a file from storage."""
        self.client.storage.from_(bucket).remove([path])
        logger.info("Deleted %s/%s", bucket, path)

    async def list_files(self, bucket: str, folder: str) -> list[dict]:
        """List files in a folder."""
        result = self.client.storage.from_(bucket).list(folder)
        return result

    def get_public_url(self, bucket: str, path: str) -> str:
        """Get the public URL for a file."""
        return self.client.storage.from_(bucket).get_public_url(path)

    @staticmethod
    def _guess_content_type(suffix: str) -> str:
        """Guess content type from file extension."""
        content_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".mp4": "video/mp4",
            ".webm": "video/webm",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".pdf": "application/pdf",
            ".csv": "text/csv",
        }
        return content_types.get(suffix.lower(), "application/octet-stream")
