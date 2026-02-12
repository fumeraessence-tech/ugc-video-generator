"""Cloud storage abstraction layer with GCS primary and local filesystem fallback."""

import datetime
import logging
import mimetypes
import os
import uuid
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# Resolve project directories once at module level
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_PROJECT_DIR = _BACKEND_DIR.parent
_LOCAL_STORAGE_ROOT = _PROJECT_DIR / "frontend" / "public" / "uploads"

# Supported folder prefixes for organising media assets
STORAGE_FOLDERS = ("images", "videos", "audio", "storyboards", "exports", "uploads")

# MIME type mapping for common media extensions
_MIME_TYPES: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".json": "application/json",
    ".pdf": "application/pdf",
}


class StorageService:
    """Unified storage interface backed by Supabase Storage, Google Cloud Storage,
    or the local filesystem.

    Priority: Supabase > GCS > Local filesystem.
    """

    def __init__(
        self,
        bucket_name: str | None = None,
        project_id: str | None = None,
    ) -> None:
        self._bucket_name = bucket_name or settings.GCS_BUCKET
        self._project_id = project_id or settings.GCS_PROJECT_ID
        self._gcs_client: object | None = None
        self._gcs_bucket: object | None = None
        self._use_gcs = False
        self._use_supabase = False
        self._supabase_storage = None

        # Try Supabase first
        self._init_supabase()

        # Fallback to GCS if Supabase not configured
        if not self._use_supabase:
            self._init_gcs()

        if self._use_supabase:
            logger.info("StorageService initialised with Supabase Storage")
        elif self._use_gcs:
            logger.info(
                "StorageService initialised with GCS bucket '%s' (project: %s)",
                self._bucket_name,
                self._project_id,
            )
        else:
            logger.info(
                "StorageService initialised with local filesystem at %s",
                _LOCAL_STORAGE_ROOT,
            )

    def _init_supabase(self) -> None:
        """Attempt to initialise Supabase Storage."""
        try:
            if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
                from app.services.supabase_storage import SupabaseStorageService
                self._supabase_storage = SupabaseStorageService()
                self._use_supabase = True
        except Exception as exc:
            logger.warning("Supabase Storage init failed (%s) -- trying GCS", exc)

    # -- GCS initialisation ----------------------------------------------------

    def _init_gcs(self) -> None:
        """Attempt to initialise the Google Cloud Storage client and bucket."""
        try:
            from google.cloud import storage as gcs_storage

            self._gcs_client = gcs_storage.Client(project=self._project_id)
            self._gcs_bucket = self._gcs_client.bucket(self._bucket_name)
            # Verify bucket exists (raises NotFound if missing)
            self._gcs_bucket.reload()
            self._use_gcs = True
        except ImportError:
            logger.warning(
                "google-cloud-storage is not installed -- falling back to local storage"
            )
        except Exception as exc:
            logger.warning(
                "GCS initialisation failed (%s) -- falling back to local storage",
                exc,
            )

    # -- Public API ------------------------------------------------------------

    async def upload_file(
        self,
        file_data: bytes,
        destination_path: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload raw bytes to storage.

        Args:
            file_data: The binary content to store.
            destination_path: Logical path inside the bucket / local root
                              (e.g. ``images/hero-shot.png``).
            content_type: MIME type of the payload.

        Returns:
            Public URL (GCS) or relative path (local) to the stored file.
        """
        if self._use_supabase:
            return await self._supabase_storage.upload_file(
                "uploads", "", destination_path, file_data, content_type
            )
        if self._use_gcs:
            return await self._gcs_upload_bytes(file_data, destination_path, content_type)
        return await self._local_upload_bytes(file_data, destination_path)

    async def upload_from_path(
        self,
        local_path: str,
        destination_path: str | None = None,
        content_type: str | None = None,
    ) -> str:
        """Upload a file from the local filesystem to storage.

        Args:
            local_path: Absolute or relative path to the source file.
            destination_path: Target path in storage.  Defaults to the
                              source filename placed under ``uploads/``.
            content_type: MIME type override.  Detected automatically when
                          ``None``.

        Returns:
            Public URL (GCS) or relative path (local) to the stored file.

        Raises:
            FileNotFoundError: If *local_path* does not exist.
        """
        src = Path(local_path)
        if not src.exists():
            raise FileNotFoundError(f"Source file not found: {local_path}")

        if destination_path is None:
            destination_path = f"uploads/{src.name}"

        if content_type is None:
            content_type = self._get_content_type(src.name)

        file_data = src.read_bytes()
        logger.info(
            "Uploading local file %s (%d bytes) -> %s",
            local_path,
            len(file_data),
            destination_path,
        )
        return await self.upload_file(file_data, destination_path, content_type)

    async def download_file(self, source_path: str) -> bytes:
        """Download a file from storage and return its bytes.

        Args:
            source_path: Logical path inside the bucket / local root.

        Returns:
            Raw bytes of the file.

        Raises:
            FileNotFoundError: If the file does not exist in storage.
        """
        if self._use_gcs:
            return await self._gcs_download(source_path)
        return await self._local_download(source_path)

    async def get_signed_url(
        self,
        path: str,
        expiration_minutes: int = 60,
    ) -> str:
        """Return a time-limited URL for accessing a file.

        For GCS this generates a real signed URL.  For local storage it
        returns a relative ``/uploads/...`` path suitable for the dev server.

        Args:
            path: Logical path inside the bucket / local root.
            expiration_minutes: Lifetime of the signed URL in minutes (GCS only).

        Returns:
            Signed URL (GCS) or relative path (local).
        """
        if self._use_gcs:
            return await self._gcs_signed_url(path, expiration_minutes)
        # Local mode -- just return the relative web path
        return f"/uploads/{path}"

    async def delete_file(self, path: str) -> bool:
        """Delete a file from storage.

        Args:
            path: Logical path inside the bucket / local root.

        Returns:
            ``True`` if the file was deleted, ``False`` if it was not found
            or the deletion failed.
        """
        if self._use_gcs:
            return await self._gcs_delete(path)
        return await self._local_delete(path)

    async def list_files(
        self,
        prefix: str = "",
        max_results: int = 100,
    ) -> list[dict]:
        """List files in storage, optionally filtered by a path prefix.

        Args:
            prefix: Only return files whose path starts with this string.
            max_results: Maximum number of entries to return.

        Returns:
            List of dicts with keys ``name``, ``size``, ``content_type``,
            and ``updated``.
        """
        if self._use_gcs:
            return await self._gcs_list(prefix, max_results)
        return await self._local_list(prefix, max_results)

    async def file_exists(self, path: str) -> bool:
        """Check whether a file exists in storage.

        Args:
            path: Logical path inside the bucket / local root.

        Returns:
            ``True`` if the file exists.
        """
        if self._use_gcs:
            return await self._gcs_exists(path)
        return (_LOCAL_STORAGE_ROOT / path).is_file()

    # -- Helper methods --------------------------------------------------------

    @staticmethod
    def _get_content_type(filename: str) -> str:
        """Determine the MIME content type from a filename's extension.

        Falls back to ``mimetypes.guess_type`` and ultimately to
        ``application/octet-stream``.
        """
        ext = Path(filename).suffix.lower()
        if ext in _MIME_TYPES:
            return _MIME_TYPES[ext]

        guessed, _ = mimetypes.guess_type(filename)
        return guessed or "application/octet-stream"

    @staticmethod
    def _generate_unique_path(
        original_filename: str,
        folder: str = "uploads",
    ) -> str:
        """Generate a collision-free storage path preserving the original extension.

        Example output: ``images/a1b2c3d4-hero-shot.png``
        """
        stem = Path(original_filename).stem
        ext = Path(original_filename).suffix.lower()
        unique_id = uuid.uuid4().hex[:8]
        safe_stem = "".join(c if c.isalnum() or c in "-_" else "-" for c in stem)
        return f"{folder}/{unique_id}-{safe_stem}{ext}"

    # -- GCS backend -----------------------------------------------------------

    async def _gcs_upload_bytes(
        self,
        data: bytes,
        destination_path: str,
        content_type: str,
    ) -> str:
        """Upload bytes to GCS and return the public URL."""
        try:
            blob = self._gcs_bucket.blob(destination_path)
            blob.upload_from_string(data, content_type=content_type)
            url = f"https://storage.googleapis.com/{self._bucket_name}/{destination_path}"
            logger.info(
                "Uploaded %d bytes to GCS: %s (type: %s)",
                len(data),
                destination_path,
                content_type,
            )
            return url
        except Exception:
            logger.exception("GCS upload failed for %s", destination_path)
            raise

    async def _gcs_download(self, source_path: str) -> bytes:
        """Download bytes from GCS."""
        try:
            blob = self._gcs_bucket.blob(source_path)
            if not blob.exists():
                raise FileNotFoundError(
                    f"GCS object not found: gs://{self._bucket_name}/{source_path}"
                )
            data = blob.download_as_bytes()
            logger.info("Downloaded %d bytes from GCS: %s", len(data), source_path)
            return data
        except FileNotFoundError:
            raise
        except Exception:
            logger.exception("GCS download failed for %s", source_path)
            raise

    async def _gcs_signed_url(self, path: str, expiration_minutes: int) -> str:
        """Generate a signed URL for a GCS object."""
        try:
            blob = self._gcs_bucket.blob(path)
            url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.timedelta(minutes=expiration_minutes),
                method="GET",
            )
            logger.info(
                "Generated signed URL for %s (expires in %d min)",
                path,
                expiration_minutes,
            )
            return url
        except Exception:
            logger.exception("Failed to generate signed URL for %s", path)
            raise

    async def _gcs_delete(self, path: str) -> bool:
        """Delete a blob from GCS."""
        try:
            blob = self._gcs_bucket.blob(path)
            if not blob.exists():
                logger.warning("GCS delete: object not found -- %s", path)
                return False
            blob.delete()
            logger.info("Deleted GCS object: %s", path)
            return True
        except Exception:
            logger.exception("GCS delete failed for %s", path)
            return False

    async def _gcs_list(self, prefix: str, max_results: int) -> list[dict]:
        """List blobs in the GCS bucket."""
        try:
            blobs = self._gcs_client.list_blobs(
                self._bucket_name,
                prefix=prefix or None,
                max_results=max_results,
            )
            results: list[dict] = []
            for blob in blobs:
                results.append({
                    "name": blob.name,
                    "size": blob.size,
                    "content_type": blob.content_type,
                    "updated": blob.updated.isoformat() if blob.updated else None,
                })
            logger.info(
                "Listed %d objects in GCS with prefix '%s'",
                len(results),
                prefix,
            )
            return results
        except Exception:
            logger.exception("GCS list failed for prefix '%s'", prefix)
            raise

    async def _gcs_exists(self, path: str) -> bool:
        """Check whether a GCS blob exists."""
        try:
            blob = self._gcs_bucket.blob(path)
            return blob.exists()
        except Exception:
            logger.exception("GCS exists check failed for %s", path)
            return False

    # -- Local filesystem backend ----------------------------------------------

    async def _local_upload_bytes(self, data: bytes, destination_path: str) -> str:
        """Write bytes to the local uploads directory."""
        try:
            target = _LOCAL_STORAGE_ROOT / destination_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            relative_url = f"/uploads/{destination_path}"
            logger.info(
                "Saved %d bytes locally: %s",
                len(data),
                target,
            )
            return relative_url
        except Exception:
            logger.exception("Local upload failed for %s", destination_path)
            raise

    async def _local_download(self, source_path: str) -> bytes:
        """Read bytes from the local uploads directory."""
        target = _LOCAL_STORAGE_ROOT / source_path
        if not target.is_file():
            raise FileNotFoundError(f"Local file not found: {target}")
        data = target.read_bytes()
        logger.info("Read %d bytes from local file: %s", len(data), target)
        return data

    async def _local_delete(self, path: str) -> bool:
        """Delete a file from the local uploads directory."""
        target = _LOCAL_STORAGE_ROOT / path
        if not target.is_file():
            logger.warning("Local delete: file not found -- %s", target)
            return False
        try:
            target.unlink()
            logger.info("Deleted local file: %s", target)
            return True
        except Exception:
            logger.exception("Local delete failed for %s", target)
            return False

    async def _local_list(self, prefix: str, max_results: int) -> list[dict]:
        """List files under the local uploads directory."""
        search_root = _LOCAL_STORAGE_ROOT / prefix if prefix else _LOCAL_STORAGE_ROOT
        if not search_root.exists():
            return []

        results: list[dict] = []
        # Use rglob to walk the directory tree
        for file_path in sorted(search_root.rglob("*")):
            if not file_path.is_file():
                continue

            relative = file_path.relative_to(_LOCAL_STORAGE_ROOT)
            stat = file_path.stat()
            results.append({
                "name": str(relative),
                "size": stat.st_size,
                "content_type": self._get_content_type(file_path.name),
                "updated": datetime.datetime.fromtimestamp(
                    stat.st_mtime, tz=datetime.timezone.utc
                ).isoformat(),
            })

            if len(results) >= max_results:
                break

        logger.info(
            "Listed %d local files with prefix '%s'",
            len(results),
            prefix,
        )
        return results
