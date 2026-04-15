import json
from pathlib import Path

from openai import OpenAI

from config import get_settings

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

SECTION_PROMPT_FILES = {
    "market_pulse": "market_pulse.txt",
    "top_banks": "top_banks.txt",
    "hot_markets": "hot_markets.txt",
    "industry_news": "industry_news.txt",
    "ufs_spotlight": "ufs_spotlight.txt",
}


def _load_prompt(section_type: str) -> str:
    filename = SECTION_PROMPT_FILES.get(section_type)
    if not filename:
        raise ValueError(f"Unknown section type: {section_type}")
    return (PROMPTS_DIR / filename).read_text()


def _draft_section(client: OpenAI, section_type: str, section_data: dict) -> dict:
    """Draft a single newsletter section using OpenAI."""
    prompt_template = _load_prompt(section_type)
    data_str = json.dumps(section_data.get("data", []), indent=2, default=str)

    if len(data_str) > 15000:
        data_str = data_str[:15000] + "\n... (truncated)"

    prompt = prompt_template.replace("{data}", data_str)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a professional newsletter writer for the REO real estate industry. "
                    "You write accurate, engaging content based ONLY on the data provided. "
                    "Never invent facts or statistics. Always return valid JSON."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    try:
        result = json.loads(content)
        result["section_type"] = section_type
        return result
    except json.JSONDecodeError:
        return {
            "section_type": section_type,
            "title": f"[Draft Error] {section_type}",
            "teaser": "Content generation encountered an issue. Please review manually.",
            "body": content,
        }


def generate_ai_draft(raw_data: dict) -> dict:
    """
    Generate AI drafts for all 5 newsletter sections.
    raw_data should contain a 'sections' key with data organized by section type.
    """
    settings = get_settings()
    if not settings.openai_api_key:
        return {
            "error": "OPENAI_API_KEY not configured",
            "sections": [],
        }

    client = OpenAI(api_key=settings.openai_api_key)
    sections_data = raw_data.get("sections", {})

    drafted_sections = []
    errors = []

    for section_type in SECTION_PROMPT_FILES:
        section_data = sections_data.get(section_type, {"data": []})
        try:
            result = _draft_section(client, section_type, section_data)
            drafted_sections.append(result)
        except Exception as e:
            errors.append(f"{section_type}: {str(e)}")
            drafted_sections.append({
                "section_type": section_type,
                "title": f"[Error] {section_type}",
                "teaser": "Failed to generate this section.",
                "body": f"Error: {str(e)}",
            })

    return {
        "sections": drafted_sections,
        "errors": errors,
        "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
