"""Perfume name cleaning utility.

Strips common suffixes like 'Eau de Parfum', 'EDP', 'EDT', size indicators,
pipes, and trailing dashes to extract the clean product name.
"""

import re


# Patterns to strip (order matters — longer phrases first)
_STRIP_PATTERNS = [
    # Full fragrance type phrases
    r"eau\s+de\s+(?:parfum|perfume|toilette|cologne)",
    r"parfum\s+(?:intense|absolu|extreme)",
    r"extrait\s+de\s+parfum",
    # Abbreviations
    r"\bEDP\b",
    r"\bEDT\b",
    r"\bEDC\b",
    r"\bEDP\b",
    # Size indicators (e.g., 50ml, 100 ml, 3.4oz, 3.4 fl oz)
    r"\b\d+\s*(?:ml|ML|oz|OZ|fl\.?\s*oz)\b",
    # Volume with units
    r"\b\d+(?:\.\d+)?\s*(?:ml|oz)\b",
]

# Compiled regex: match any of the patterns (case-insensitive)
_STRIP_RE = re.compile(
    r"|".join(f"(?:{p})" for p in _STRIP_PATTERNS),
    re.IGNORECASE,
)

# Separators that indicate the clean name ends before them
_SEPARATOR_RE = re.compile(r"\s*[\|\-–—]\s*")


def clean_perfume_name(raw: str) -> str:
    """Extract the clean product name from a raw perfume name string.

    Examples:
        "Qamrah - Eau de Perfume"          → "Qamrah"
        "Starlet Bloom - 50ml | EDP"       → "Starlet Bloom"
        "Royal Oud Eau de Parfum 100ml"    → "Royal Oud"
        "Midnight Rose | EDP | 30ml"       → "Midnight Rose"
        "AVENTUS - Eau de Parfum Intense"  → "AVENTUS"
        "Simple Name"                      → "Simple Name"
    """
    if not raw or not raw.strip():
        return raw.strip() if raw else ""

    name = raw.strip()

    # Step 1: Remove known patterns (EDP, Eau de Parfum, sizes, etc.)
    name = _STRIP_RE.sub("", name)

    # Step 2: Split on separators (pipe, dash, em-dash) and take the first segment
    # Only if the first segment is non-empty after stripping
    parts = _SEPARATOR_RE.split(name)
    candidates = [p.strip() for p in parts if p.strip()]

    if candidates:
        name = candidates[0]
    else:
        name = name.strip()

    # Step 3: Clean up residual whitespace / trailing punctuation
    name = re.sub(r"\s+", " ", name).strip()
    name = name.strip("-–—|/,. ")

    return name
