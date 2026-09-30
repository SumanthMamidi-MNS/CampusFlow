from functools import lru_cache

from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.mail.console import ConsoleBackend
from campusflow.bedrock.mail.interface import EmailBackend
from campusflow.bedrock.mail.smtp import SMTPBackend


@lru_cache
def get_mailer() -> EmailBackend:
    """Factory to retrieve configured EmailBackend singleton."""
    settings = get_settings()
    if settings.email_backend == "smtp":
        return SMTPBackend()
    return ConsoleBackend()
