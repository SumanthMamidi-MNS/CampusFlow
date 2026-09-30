import logging

from campusflow.bedrock.mail.interface import EmailBackend

logger = logging.getLogger("campusflow.mail")


class ConsoleBackend(EmailBackend):
    """Development email backend that logs messages to the console."""

    async def send_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
    ) -> bool:
        logger.info(
            "\n[MAIL SEND] To: %s\nSubject: %s\n--- Text Body ---\n%s\n-------------------",
            to_email,
            subject,
            body_text,
        )
        return True
