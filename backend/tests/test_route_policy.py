"""Route policy — every route declares a gate or is deliberately public.

The approved plan forbids endpoints without an explicit dependency: a
permission, a role set, or membership in the small audited set of public
routes (health, authentication). Hiding a page in the UI is not security, so
this test walks the *live* application route table instead of trusting
per-file review: any new endpoint that forgets a gate fails here.

It also pins the answer-material surface: the question-bank routes carry
candidate answer keys, so they must hold a permission gate rather than mere
authentication — a regression back to "any logged-in user" fails this test
even before an end-to-end canary runs.
"""

from fastapi.routing import APIRoute

from campusflow.main import create_app

# The complete allowlist of routes reachable without credentials.
PUBLIC_PATHS = frozenset(
    {
        "/api/health",
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/auth/refresh",
        "/api/v1/auth/password/reset",
        "/api/v1/auth/password/reset-request",
    }
)

# Gate factories defined in bedrock (auth + rbac dependencies).
GATE_NAMES = frozenset(
    {
        "require_permission",
        "require_any_permission",
        "require_any_role",
        "require_role",
        "get_current_active_user",
        "get_current_user",
    }
)

# Routes that expose answer material and therefore need a *permission* gate,
# not just a session.
ANSWER_MATERIAL_PREFIXES = ("/api/v1/question-banks", "/api/v1/questions")


def _dependency_names(dependant, found: set[str]) -> set[str]:
    """Collect gate names from a FastAPI dependant tree (recursively)."""
    for sub in dependant.dependencies:
        fn = sub.call
        qualname = getattr(fn, "__qualname__", None) or getattr(fn, "__name__", "")
        # A factory like require_permission returns an inner checker whose
        # qualname is "require_permission.<locals>.permission_checker".
        name = qualname.split("<locals>")[0].strip(".")
        found.add(name)
        _dependency_names(sub, found)
    return found


def _iter_routes(app):
    """Yield (path, gate-names) for every route, unwrapping included routers."""
    for route in app.routes:
        if isinstance(route, APIRoute):
            yield route.path, _dependency_names(route.dependant, set())
        elif type(route).__name__ == "_IncludedRouter":
            prefix = getattr(route.include_context, "prefix", "") or ""
            stack = list(route.original_router.routes)
            while stack:
                sub = stack.pop()
                if isinstance(sub, APIRoute):
                    yield prefix + sub.path, _dependency_names(sub.dependant, set())
                elif type(sub).__name__ == "_IncludedRouter":
                    inner = prefix + (getattr(sub.include_context, "prefix", "") or "")
                    for leaf in sub.original_router.routes:
                        if isinstance(leaf, APIRoute):
                            yield inner + leaf.path, _dependency_names(leaf.dependant, set())
                        elif type(leaf).__name__ == "_IncludedRouter":
                            # Nested routers deeper than two levels do not
                            # exist in this app; fail loudly if introduced.
                            raise AssertionError(
                                "route nesting deeper than two levels is not covered "
                                f"by the policy walk: {inner}"
                            )
                else:
                    continue


def _route_table():
    return sorted(_iter_routes(create_app()), key=lambda row: row[0])


def test_every_route_has_a_declared_gate_or_is_public():
    unguarded = []
    for path, gates in _route_table():
        if path in PUBLIC_PATHS:
            continue
        if not (gates & GATE_NAMES):
            unguarded.append(path)

    assert not unguarded, (
        "routes without a declared authorization gate "
        f"(gate them with a permission/role dependency or add them to "
        f"PUBLIC_PATHS deliberately): {unguarded}"
    )


def test_public_allowlist_contains_only_deliberately_public_routes():
    table = dict(_route_table())
    # Every allowlisted path must actually exist, so the list cannot rot.
    missing = [path for path in PUBLIC_PATHS if path not in table]
    assert not missing, f"PUBLIC_PATHS entries do not exist in the app: {missing}"
    # And nothing outside the allowlist may be reachable anonymously: the
    # complement check above proves this, this asserts the allowlist itself is
    # still exactly the health/authentication surface.
    assert all(
        path.startswith("/api/health") or path.startswith("/api/v1/auth/")
        for path in PUBLIC_PATHS
    ), "the public allowlist may only contain health and authentication routes"


def test_answer_material_routes_require_a_permission_gate():
    offenders = []
    for path, gates in _route_table():
        if not path.startswith(ANSWER_MATERIAL_PREFIXES):
            continue
        # /question-banks and /questions hold is_correct, explanations and
        # accepted answers: authentication alone must never reach them.
        if not any(gate.startswith("require_") for gate in gates):
            offenders.append((path, sorted(gates)))
    assert not offenders, (
        "answer-material routes reachable with mere authentication "
        f"(require a permission such as questions:manage): {offenders}"
    )
