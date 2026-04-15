from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./ufs_newsletter.db"

    # OpenAI
    openai_api_key: str = ""

    # Data Sources
    grok_api_key: str = ""
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "ufs-newsletter/1.0"
    news_api_key: str = ""
    fred_api_key: str = ""
    foreclosure_com_enabled: bool = True
    foreclosure_com_cookie: str = ""
    zillow_cookie: str = ""
    scrapling_enabled: bool = True
    scrapling_timeout_seconds: int = 20
    scrapling_follow_redirects: bool = True
    scrapling_headless: bool = True
    scrapling_stealth_retry: bool = True
    pinchtab_enabled: bool = False
    pinchtab_base_url: str = "http://127.0.0.1:9867"
    pinchtab_token: str = ""
    pinchtab_profile_name: str = "ufs-newsletter"
    pinchtab_headless: bool = True
    pinchtab_create_profile: bool = True
    pinchtab_settle_seconds: int = 4

    # Mailchimp
    mailchimp_api_key: str = ""
    mailchimp_server_prefix: str = ""
    mailchimp_list_id: str = ""
    mailchimp_template_id: str = ""

    # Email notifications
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    reviewer_email: str = ""

    # MS Platform
    ms_platform_api_url: str = ""
    ms_platform_api_key: str = ""

    # App
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_public_url: str = "http://localhost:8000"
    dashboard_url: str = "http://localhost:3000"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
