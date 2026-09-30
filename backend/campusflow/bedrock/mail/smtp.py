import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.mail.interface import EmailBackend


class SMTPBackend(EmailBackend):
    def __init__(self):
        self.settings = get_settings()

    async def send_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
    ) -> bool:
        # Offload synchronous smtplib to thread pool
        return await asyncio.to_thread(self._send_sync, to_email, subject, body_text, body_html)

    def _send_sync(
        self, to_email: str, subject: str, body_text: str, body_html: str | None
    ) -> bool:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = "noreply@campusflow.local"
        msg["To"] = to_email

        msg.attach(MIMEText(body_text, "plain", "utf-8"))
        if body_html:
            msg.attach(MIMEText(body_html, "html", "utf-8"))

        try:
            # Mailpit or standard SMTP server
            with smtplib.SMTP("localhost", 1025, timeout=5) as server:
                server.sendmail(msg["From"], [to_email], msg.as_string())
            return True
        except Exception:
            return False
