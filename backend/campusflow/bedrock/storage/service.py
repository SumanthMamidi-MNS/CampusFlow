from functools import lru_cache

from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.storage.interface import StorageBackend
from campusflow.bedrock.storage.local import LocalFilesystemBackend


@lru_cache
def get_storage() -> StorageBackend:
    """Factory to retrieve configured StorageBackend singleton."""
    settings = get_settings()
    if settings.storage_backend == "local":
        return LocalFilesystemBackend(settings.storage_local_path)
    # Future S3 backend can be loaded here
    return LocalFilesystemBackend(settings.storage_local_path)
