from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8000
    database_url: str = "postgresql+asyncpg://supergrow:supergrow@localhost:5433/supergrow"

    # Internal auth — Express gateway sends this header
    service_token: str = "supergrow-internal-token-change-in-prod"

    # X API
    x_bearer_token: str = ""
    x_api_key: str = ""
    x_api_secret: str = ""

    # Token decryption (must match server ENCRYPTION_KEY)
    encryption_key: str = "0" * 64

    # LLM
    anthropic_api_key: str = ""

    # Gateway
    gateway_url: str = "http://127.0.0.1:4000"


settings = Settings()
