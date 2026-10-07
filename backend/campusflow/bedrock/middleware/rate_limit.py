"""Rate limiting for credential-handling endpoints.

A lightweight sliding-window limiter keyed by client IP. It deliberately
targets only the authentication entry points (login, refresh, password reset)
so that ordinary API traffic — including many users behind a single campus NAT
address — is never throttled by it.

The in-process store is appropriate for a single-node deployment. When the
institution runs multiple API workers, back this with Redis (see
``settings.redis_url``), which is already provisioned in the deployment.
"""

import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# Only these authentication entry points are protected.
PROTECTED_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/password/reset-request",
    "/api/v1/auth/password/reset",
}

# Bound memory if a deployment is targeted by a spray of spoofed addresses.
MAX_TRACKED_CLIENTS = 10_000


class AuthRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        max_requests: int = 20,
        window_seconds: int = 60,
    ) -> None:
        super().__init__(app)
        self.max_requests = max(1, int(max_requests))
        self.window_seconds = max(1, int(window_seconds))
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if request.url.path not in PROTECTED_PATHS:
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        now = time.monotonic()

        if len(self._hits) > MAX_TRACKED_CLIENTS:
            self._hits.clear()

        bucket = self._hits[client]
        while bucket and now - bucket[0] > self.window_seconds:
            bucket.popleft()

        if len(bucket) >= self.max_requests:
            retry_after = max(1, int(self.window_seconds - (now - bucket[0])))
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": (
                            "Too many authentication attempts were made from this address. "
                            "Please wait and try again."
                        ),
                    }
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-Content-Type-Options": "nosniff",
                    "X-Frame-Options": "DENY",
                    "Referrer-Policy": "strict-origin-when-cross-origin",
                },
            )

        bucket.append(now)
        return await call_next(request)
