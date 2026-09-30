from typing import Protocol, runtime_checkable


@runtime_checkable
class StorageBackend(Protocol):
    async def upload(
        self, path: str, data: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        """Upload binary data to storage path, returning the identifier or URL."""
        ...

    async def download(self, path: str) -> bytes:
        """Retrieve binary file contents from storage path."""
        ...

    async def delete(self, path: str) -> None:
        """Remove file from storage."""
        ...

    async def exists(self, path: str) -> bool:
        """Check whether a file exists at the given path."""
        ...

    async def get_url(self, path: str, expires_in: int = 3600) -> str:
        """Generate access URL or pre-signed URL."""
        ...
