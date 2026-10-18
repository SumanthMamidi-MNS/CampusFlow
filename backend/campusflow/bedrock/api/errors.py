from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppException(Exception):
    def __init__(
        self, status_code: int, error_code: str, message: str, details: list[Any] | None = None
    ):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or []


class NotFoundError(AppException):
    def __init__(self, message: str = "Resource not found", details: list[Any] | None = None):
        super().__init__(404, "NOT_FOUND", message, details)


class ValidationError(AppException):
    def __init__(self, message: str = "Validation error", details: list[Any] | None = None):
        super().__init__(400, "VALIDATION_ERROR", message, details)


class AuthenticationError(AppException):
    def __init__(self, message: str = "Authentication failed", details: list[Any] | None = None):
        super().__init__(401, "UNAUTHENTICATED", message, details)


class AuthorizationError(AppException):
    def __init__(self, message: str = "Permission denied", details: list[Any] | None = None):
        super().__init__(403, "UNAUTHORIZED", message, details)


class ConflictError(AppException):
    def __init__(self, message: str = "Resource conflict", details: list[Any] | None = None):
        super().__init__(409, "CONFLICT", message, details)


class ServiceUnavailableError(AppException):
    def __init__(self, message: str = "Service unavailable", details: list[Any] | None = None):
        super().__init__(503, "SERVICE_UNAVAILABLE", message, details)


def _format_error_response(
    request: Request, error_code: str, message: str, details: list[Any]
) -> dict[str, Any]:
    return {
        "error": {"code": error_code, "message": message, "details": details},
        "meta": {"request_id": getattr(request.state, "request_id", None)},
    }


def _json_safe(value: Any) -> Any:
    """Render one validation-error field as something JSON can carry.

    Pydantic error entries may hold arbitrary Python objects — ``ctx`` carries
    the exception a custom validator raised, and ``input`` can be any parsed
    value. Passing those straight to ``JSONResponse`` raised a TypeError inside
    the error handler itself, so a validator that rejected a request turned the
    intended 422 into an opaque 500. Every field is now encoded, and anything
    that still cannot be encoded degrades to its string form instead of taking
    the response down with it.
    """
    try:
        return jsonable_encoder(value)
    except Exception:
        return str(value)


def _validation_error_details(exc: RequestValidationError) -> list[dict[str, Any]]:
    """Validation errors as JSON-safe dictionaries, keys preserved."""
    return [
        {key: _json_safe(value) for key, value in error.items()} for error in exc.errors()
    ]


def register_exception_handlers(app: FastAPI):
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content=_format_error_response(request, exc.error_code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=_format_error_response(
                request,
                "UNPROCESSABLE_ENTITY",
                "Validation Error",
                _validation_error_details(exc),
            ),
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content=_format_error_response(
                request, "INTERNAL_SERVER_ERROR", "An unexpected error occurred", []
            ),
        )
