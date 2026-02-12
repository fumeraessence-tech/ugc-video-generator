"""Requirements detection agent.

Analyzes conversation context and generation settings to determine
whether the user has provided enough information to start video generation,
and generates proactive guidance when items are missing.
"""

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ReadinessCheck:
    """Result of a readiness analysis."""

    ready: bool = False
    missing: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    next_question: str = ""
    completeness_score: float = 0.0


class RequirementsAgent:
    """Analyzes generation readiness based on prompt, settings, and history."""

    # Minimum requirements for each generation mode
    REQUIRED_FOR_INGREDIENTS = {
        "avatar_or_prompt": "An avatar selected OR a character description in the prompt",
        "clear_intent": "A clear description of what the video should show",
    }

    RECOMMENDED_FOR_QUALITY = {
        "avatar_front_ref": "Front-facing avatar reference image",
        "avatar_side_refs": "Side-angle avatar reference images (left + right)",
        "product_images": "Product images (if product is featured)",
        "product_name": "Product name (if product is featured)",
    }

    def analyze_readiness(
        self,
        prompt: str,
        settings: dict | None = None,
        history: list[dict] | None = None,
    ) -> ReadinessCheck:
        """Analyze whether the user has provided enough to start generation.

        Args:
            prompt: The user's current message
            settings: Current generation settings (avatarId, productImages, etc.)
            history: Conversation history [{role, content}, ...]

        Returns:
            ReadinessCheck with ready status and missing items
        """
        settings = settings or {}
        history = history or []
        check = ReadinessCheck()
        total_items = 0
        completed_items = 0

        # 1. Check for avatar/character
        total_items += 1
        has_avatar = bool(settings.get("selectedAvatarId"))
        has_avatar_refs = bool(settings.get("avatarReferenceImages"))
        has_character_desc = self._prompt_mentions_character(prompt, history)

        if has_avatar or has_avatar_refs or has_character_desc:
            completed_items += 1
        else:
            check.missing.append("avatar_or_character")

        # 2. Check for clear video intent
        total_items += 1
        if self._has_clear_intent(prompt, history):
            completed_items += 1
        else:
            check.missing.append("clear_intent")

        # 3. Check avatar reference quality (recommended)
        if has_avatar:
            total_items += 1
            ref_images = settings.get("avatarReferenceImages", [])
            angle_coverage = settings.get("avatarAngleCoverage", {})

            if len(ref_images) >= 3 or angle_coverage.get("complete"):
                completed_items += 1
            elif len(ref_images) >= 1:
                completed_items += 0.5
                check.warnings.append("avatar_needs_more_angles")
            else:
                check.warnings.append("avatar_no_references")

        # 4. Check product images if product is mentioned
        mentions_product = self._prompt_mentions_product(prompt, history)
        has_product_images = bool(settings.get("productImages"))
        has_product_name = bool(settings.get("productName"))

        if mentions_product or has_product_images or has_product_name:
            total_items += 1
            if has_product_images:
                completed_items += 1
            else:
                check.warnings.append("product_mentioned_no_images")

            total_items += 1
            if has_product_name:
                completed_items += 1
            else:
                check.warnings.append("product_no_name")

        # Calculate completeness
        check.completeness_score = completed_items / max(total_items, 1)
        check.ready = len(check.missing) == 0
        check.next_question = self._generate_next_question(check)

        return check

    def generate_guidance_response(self, check: ReadinessCheck) -> str:
        """Generate a natural language response guiding the user."""
        if check.ready and not check.warnings:
            return ""

        parts: list[str] = []

        if not check.ready:
            parts.append(
                "I'd love to help create your video! Before we start, I need a bit more information:"
            )
            parts.append("")

            for item in check.missing:
                if item == "avatar_or_character":
                    parts.append(
                        "- **Character/Avatar**: Select an avatar from the sidebar, "
                        "or describe the person who should appear in the video "
                        "(age, appearance, style)."
                    )
                elif item == "clear_intent":
                    parts.append(
                        "- **Video description**: What should the video show? "
                        "Describe the scene, action, or story you'd like to create."
                    )
        elif check.warnings:
            parts.append(
                "I can start generating your video now, but here are some tips "
                "for better results:"
            )
            parts.append("")

        for warning in check.warnings:
            if warning == "avatar_needs_more_angles":
                parts.append(
                    "- **Tip**: Upload left and right profile photos of your avatar "
                    "for better character consistency across scenes."
                )
            elif warning == "avatar_no_references":
                parts.append(
                    "- **Tip**: Upload at least one reference photo of your avatar "
                    "to improve character consistency."
                )
            elif warning == "product_mentioned_no_images":
                parts.append(
                    "- **Product images**: You mentioned a product — upload some "
                    "product photos so it looks accurate in the video."
                )
            elif warning == "product_no_name":
                parts.append(
                    "- **Product name**: What's the name of the product? "
                    "This helps generate accurate scripts and on-screen text."
                )

        if check.next_question:
            parts.append("")
            parts.append(check.next_question)

        return "\n".join(parts)

    def _prompt_mentions_character(
        self, prompt: str, history: list[dict]
    ) -> bool:
        """Check if the prompt or recent history describes a character."""
        text = prompt.lower()
        character_keywords = [
            "person", "woman", "man", "girl", "boy", "actor", "talent",
            "influencer", "creator", "model", "host", "presenter",
            "she ", "he ", "her ", "his ", "they ",
            "young", "old", "wearing", "dressed",
        ]
        if any(kw in text for kw in character_keywords):
            return True

        # Check recent history
        for msg in history[-5:]:
            msg_text = msg.get("content", "").lower()
            if any(kw in msg_text for kw in character_keywords):
                return True

        return False

    def _prompt_mentions_product(
        self, prompt: str, history: list[dict]
    ) -> bool:
        """Check if a product is mentioned."""
        text = prompt.lower()
        product_keywords = [
            "product", "brand", "bottle", "package", "item",
            "skincare", "makeup", "supplement", "drink", "food",
            "unboxing", "review", "showcase", "demo",
        ]
        if any(kw in text for kw in product_keywords):
            return True

        for msg in history[-5:]:
            msg_text = msg.get("content", "").lower()
            if any(kw in msg_text for kw in product_keywords):
                return True

        return False

    def _has_clear_intent(self, prompt: str, history: list[dict]) -> bool:
        """Check if there's a clear video intent/description."""
        text = prompt.lower()
        # Minimum: the prompt should be descriptive enough (>15 chars) and mention
        # something about the video content
        if len(text) < 15:
            return False

        intent_keywords = [
            "video", "scene", "show", "create", "make", "generate",
            "film", "record", "shoot", "produce", "clip",
            "talking", "holding", "walking", "sitting", "standing",
            "opening", "applying", "demonstrating", "reviewing",
        ]
        if any(kw in text for kw in intent_keywords):
            return True

        # If prompt is descriptive enough (>50 chars), assume intent
        if len(text) > 50:
            return True

        return False

    def _generate_next_question(self, check: ReadinessCheck) -> str:
        """Generate the most important next question to ask."""
        if "avatar_or_character" in check.missing:
            return "Who should appear in the video? You can select an avatar from the sidebar or describe the person."
        if "clear_intent" in check.missing:
            return "What would you like the video to show? Describe the scene or action."
        if "product_mentioned_no_images" in check.warnings:
            return "Could you upload some photos of the product? This helps generate accurate visuals."
        if "avatar_needs_more_angles" in check.warnings:
            return "For better consistency, consider uploading side-angle photos of your avatar."
        return ""
