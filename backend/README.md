# CampusFlow Backend

College LMS & Secure Examination Platform API.

## Prerequisites
- Python 3.12+
- Docker & Docker Compose

## Setup Instructions

1. Install dependencies:
   ```bash
   pip install -e ".[dev]"
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```

3. Run migrations:
   ```bash
   alembic upgrade head
   ```

4. Run the development server:
   ```bash
   uvicorn campusflow.main:app --reload
   ```

Note: Docker Compose is the recommended way to run the application components (will be located at project root).
