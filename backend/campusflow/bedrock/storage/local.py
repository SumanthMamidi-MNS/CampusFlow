from pathlib import Path

from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.storage.interface import StorageBackend


class LocalFilesystemBackend(StorageBackend):
    def __init__(self, base_path: str | None = None):
        settings = get_settings()
        self.base_path = Path(base_path or settings.storage_local_path).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, path: str) -> Path:
        resolved = (self.base_path / path).resolve()
        # Prevent directory traversal attacks
        if not str(resolved).startswith(str(self.base_path)):
            raise ValueError("Path traversal attempt detected.")
        return resolved

    async def upload(
        self, path: str, data: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        target_path = self._resolve_path(path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(data)
        return path

    async def download(self, path: str) -> bytes:
        target_path = self._resolve_path(path)
        if not target_path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return target_path.read_bytes()

    async def delete(self, path: str) -> None:
        target_path = self._resolve_path(path)
        if target_path.exists():
            target_path.unlink()

    async def exists(self, path: str) -> bool:
        return self._resolve_path(path).exists()

    async def get_url(self, path: str, expires_in: int = 3600) -> str:
        # In local development, return relative API endpoint path
        return f"/api/v1/storage/{path}"
