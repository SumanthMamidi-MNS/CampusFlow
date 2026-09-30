from typing import Protocol, runtime_checkable


@runtime_checkable
class EmailBackend(Protocol):
    async def send_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
    ) -> bool:
        """Send an email to the specified recipient."""
        ...
