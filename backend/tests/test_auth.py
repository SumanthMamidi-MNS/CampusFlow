import pytest

from campusflow.bedrock.auth.jwt import create_access_token, decode_access_token
from campusflow.bedrock.auth.pwd import get_password_hash, verify_password
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.users.models import User


def test_password_hashing():
    pwd = "SecretPassword123!"
    hashed = get_password_hash(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_jwt_generation_and_decoding():
    payload = {"sub": "12345", "role": "admin"}
    token = create_access_token(payload)
    decoded = decode_access_token(token)
    assert decoded["sub"] == "12345"
    assert decoded["role"] == "admin"
    assert "exp" in decoded


@pytest.mark.asyncio
async def test_auth_login_and_me_flow(client, db_session):
    # 1. Create a user
    user = User(
        email="lecturer@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass2026!"),
        first_name="Jane",
        last_name="Doe",
        status="active",
    )
    db_session.add(user)
    await db_session.flush()
    await assign_role_to_user(db_session, user.id, "faculty")
    await db_session.commit()

    # 2. Login with valid credentials
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "lecturer@campusflow.edu", "password": "FacultyPass2026!"},
    )
    assert login_resp.status_code == 200
    login_data = login_resp.json()["data"]
    assert "access_token" in login_data
    assert login_data["user"]["email"] == "lecturer@campusflow.edu"
    assert "faculty" in login_data["user"]["roles"]

    # Cookie must contain refresh_token
    assert "refresh_token" in login_resp.cookies
    refresh_cookie = login_resp.cookies["refresh_token"]

    token = login_data["access_token"]

    # 3. Call /auth/me with access token
    me_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_resp.status_code == 200
    me_data = me_resp.json()["data"]
    assert me_data["email"] == "lecturer@campusflow.edu"
    assert "faculty" in me_data["roles"]
    assert "courses:read" in me_data["permissions"]

    # 4. Refresh tokens
    client.cookies.set("refresh_token", refresh_cookie)
    refresh_resp = await client.post("/api/v1/auth/refresh")
    assert refresh_resp.status_code == 200
    assert "access_token" in refresh_resp.json()["data"]

    # 5. Logout
    logout_resp = await client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 200


@pytest.mark.asyncio
async def test_login_invalid_password(client, db_session):
    user = User(
        email="student@campusflow.edu",
        hashed_password=get_password_hash("StudentPass!"),
        first_name="Bob",
        last_name="Smith",
        status="active",
    )
    db_session.add(user)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "student@campusflow.edu", "password": "WrongPassword"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHENTICATED"
