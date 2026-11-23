import os
import sys
from pathlib import Path

# Ensure backend is importable and Settings can initialize during tests.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Use a dummy asyncpg URL: create_async_engine does not connect on construction.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("BOT_TOKEN", "test-token")
os.environ.setdefault("PUBLIC_API_URL", "https://api.example.com")
os.environ.setdefault("WEBAPP_URL", "https://shop.example.com")
os.environ.setdefault("TELEGRAM_BOT_USERNAME", "farrux_test_bot")
os.environ.setdefault("QR_TOKEN", "farrux")
os.environ.setdefault("APP_ENV", "test")
