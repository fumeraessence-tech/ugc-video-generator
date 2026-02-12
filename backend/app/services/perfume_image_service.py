"""Perfume bulk image generation service with Production Bible, avatar DNA, and product DNA."""

import json
import logging
import random
import uuid
from pathlib import Path

from google import genai
from google.genai import types

from app.config import settings
from app.models.schemas import (
    GenderAvatarMapping,
    GenderAvatarSlot,
    InspirationDNA,
    PerfumeAvatarDNA,
    PerfumeInfo,
    PerfumeNotes,
    PerfumeProductDNA,
    PerfumeStyle,
)
from app.services.image_service import ImageService

logger = logging.getLogger(__name__)

ALL_STYLES = [s.value for s in PerfumeStyle]

# Pinterest-inspired scene variations for dynamic composition
NOTES_BASED_SCENES = [
    {
        "mood": "Editorial Moody",
        "backdrop": "dark charcoal slate surface with subtle texture",
        "lighting": "dramatic side light from 45°, deep shadows, golden hour warmth",
        "arrangement": "bottle off-center (rule of thirds), ingredients scattered artfully in foreground and mid-ground",
        "style_notes": "dewy fresh ingredients, natural shadows, sophisticated editorial feel",
    },
    {
        "mood": "Natural Organic",
        "backdrop": "weathered oak wood planks with visible grain and knots",
        "lighting": "soft window light from side, gentle shadows, warm natural tones",
        "arrangement": "bottle positioned diagonally, ingredients clustered asymmetrically around base",
        "style_notes": "rustic, earthy, farm-to-table aesthetic, ingredients look freshly picked",
    },
    {
        "mood": "Minimalist Zen",
        "backdrop": "smooth river stones and white sand with rake patterns",
        "lighting": "diffused overhead light, very subtle shadows, tranquil atmosphere",
        "arrangement": "bottle centered, ingredients placed with precise intentional spacing",
        "style_notes": "clean, meditative, Japanese-inspired, negative space as design element",
    },
    {
        "mood": "Luxury Editorial",
        "backdrop": "black marble with white and gold veining",
        "lighting": "dramatic Rembrandt lighting, high contrast, metallic reflections",
        "arrangement": "bottle at golden ratio position, ingredients styled like jewelry display",
        "style_notes": "opulent, magazine-quality, every element perfectly placed, rich textures",
    },
    {
        "mood": "Botanical Garden",
        "backdrop": "deep forest green velvet fabric with soft folds",
        "lighting": "warm golden light from above-left, soft highlights on bottle cap",
        "arrangement": "bottle nestled among lush botanical elements, ingredients overflow frame",
        "style_notes": "abundant, verdant, garden party aesthetic, ingredients look alive and thriving",
    },
    {
        "mood": "Desert Minimalism",
        "backdrop": "warm sand dunes with windswept patterns, terracotta accents",
        "lighting": "harsh direct sunlight creating sharp shadows, warm color temperature",
        "arrangement": "bottle standing alone, sparse ingredient placement, vast negative space",
        "style_notes": "stark, sun-baked, Mediterranean, ingredients appear rare and precious",
    },
]

LIFESTYLE_MALE_SCENES = [
    {
        "setting": "Modern luxury apartment, floor-to-ceiling windows, city skyline at dusk",
        "wardrobe": "tailored charcoal suit, crisp white shirt, top button undone",
        "pose": "standing, bottle held at chest height, confident stance, direct eye contact",
        "mood": "sophisticated urban professional, magnetic confidence",
    },
    {
        "setting": "Industrial loft with exposed brick, vintage leather furniture, warm Edison bulbs",
        "wardrobe": "black turtleneck, tailored dark jeans, minimalist watch",
        "pose": "seated on leather chair, bottle resting on armrest, relaxed but intentional",
        "mood": "refined masculinity, modern gentleman, understated luxury",
    },
    {
        "setting": "Rooftop terrace at night, string lights, city lights bokeh in background",
        "wardrobe": "midnight blue blazer over black t-shirt, stubble, tousled hair",
        "pose": "leaning against railing, bottle held casually at waist, three-quarter profile",
        "mood": "mysterious allure, after-hours sophistication, magnetic presence",
    },
    {
        "setting": "Minimalist studio, concrete walls, dramatic shadow play from window blinds",
        "wardrobe": "crisp white button-down, sleeves rolled to elbows, understated luxury",
        "pose": "arms crossed, bottle held in one hand, architectural pose, jaw defined",
        "mood": "sharp, editorial fashion, architectural masculinity, clean lines",
    },
]

LIFESTYLE_FEMALE_SCENES = [
    {
        "setting": "Parisian apartment, ornate mirror, morning light through sheer curtains",
        "wardrobe": "silk champagne slip dress, delicate gold jewelry, natural makeup",
        "pose": "seated at vanity, applying perfume to wrist, graceful neck tilt, soft smile",
        "mood": "effortless elegance, morning ritual, intimate femininity",
    },
    {
        "setting": "Modern minimalist bedroom, white linen sheets, soft diffused window light",
        "wardrobe": "oversized white silk shirt, natural skin, tousled hair, bare shoulders",
        "pose": "reclining on bed, bottle held delicately, dreamy gaze away from camera",
        "mood": "intimate luxury, sensual softness, unguarded moment",
    },
    {
        "setting": "Garden terrace with climbing roses, dappled afternoon sunlight, vintage furniture",
        "wardrobe": "flowing floral midi dress, straw hat nearby, natural radiant skin",
        "pose": "standing among flowers, bottle held at collarbone, ethereal pose, wind in hair",
        "mood": "romantic garden party, natural beauty, timeless femininity",
    },
    {
        "setting": "Rooftop at golden hour, city skyline, warm sunset glow, modern architecture",
        "wardrobe": "elegant black evening gown, statement earrings, sophisticated updo",
        "pose": "profile silhouette against sky, bottle held elegantly, neck extended, commanding presence",
        "mood": "powerful femininity, city sophisticate, evening allure",
    },
]

FLAT_LAY_SCENES = [
    {
        "surface": "pristine white marble with subtle grey veining",
        "props": "gold vintage mirror, silk ribbon, fresh flower petals, jewelry pieces",
        "arrangement": "asymmetrical golden ratio layout, bottle at focal point, props create visual flow",
        "lighting": "soft overhead with gentle shadows, afternoon window light quality",
    },
    {
        "surface": "weathered reclaimed wood with natural patina",
        "props": "dried botanicals, brass scissors, handwritten note, vintage stamps",
        "arrangement": "organic scattered composition, bottle center-right, props tell a story",
        "lighting": "warm side light creating long shadows, golden hour mood",
    },
    {
        "surface": "smooth concrete with industrial texture",
        "props": "architectural elements, geometric shapes, metal accents, minimalist",
        "arrangement": "precise geometric layout, bottle aligned with invisible grid, modern aesthetic",
        "lighting": "harsh overhead creating graphic shadows, high contrast",
    },
    {
        "surface": "soft blush velvet fabric with gentle folds",
        "props": "fresh roses, pearl necklace, vintage hand mirror, silk scarf",
        "arrangement": "romantic diagonal composition, bottle nestled in fabric, luxurious abundance",
        "lighting": "soft diffused light, dreamy atmosphere, no harsh shadows",
    },
]

CLOSEUP_SCENES = [
    {
        "focus": "extreme close-up of cap texture and metallic details",
        "background": "deep out-of-focus bokeh, warm amber tones",
        "detail": "macro shot of gold band on cap, wood grain texture, reflections in metal",
    },
    {
        "focus": "label detail with product name sharply in focus",
        "background": "soft gradient blur from bottle to background",
        "detail": "embossed label text, pattern details, light catching on texture",
    },
    {
        "focus": "liquid and light refraction through glass",
        "background": "pure white fading to soft grey",
        "detail": "perfume color glowing through bottle, caustics, glass clarity",
    },
    {
        "focus": "bottle silhouette with rim lighting",
        "background": "dark dramatic backdrop with single light source",
        "detail": "edge light defining bottle shape, cap glowing, mysterious mood",
    },
]

# Liquid color palette based on fragrance note families
LIQUID_COLOR_MAP = {
    # Citrus/Fresh
    "citrus": "pale golden yellow",
    "bergamot": "light amber yellow",
    "lemon": "bright pale yellow",
    "orange": "soft golden orange",
    "grapefruit": "light pink-tinged yellow",
    "yuzu": "pale greenish yellow",

    # Floral
    "rose": "pale pink with golden undertones",
    "jasmine": "soft champagne gold",
    "lavender": "pale lavender grey",
    "violet": "soft purple-tinged clear",
    "lily": "crystal clear with faint ivory",
    "peony": "delicate pale pink",

    # Woody/Earthy
    "sandalwood": "warm honey amber",
    "cedarwood": "deep amber brown",
    "vetiver": "earthy golden brown",
    "patchouli": "rich dark amber",
    "oak": "deep cognac brown",

    # Oriental/Spicy
    "vanilla": "creamy ivory gold",
    "cinnamon": "warm reddish amber",
    "cardamom": "pale greenish gold",
    "saffron": "deep golden orange",
    "amber": "rich honey amber",

    # Fresh/Aquatic
    "marine": "pale aqua blue",
    "sea salt": "crystal clear",
    "mint": "very pale mint green",
    "eucalyptus": "light greenish clear",

    # Fruity
    "apple": "light golden green",
    "pear": "pale greenish gold",
    "peach": "soft peachy pink",
    "plum": "deep burgundy red",
    "blackcurrant": "deep ruby red",

    # Gourmand
    "chocolate": "deep brown amber",
    "caramel": "rich golden brown",
    "honey": "warm golden amber",
    "almond": "soft ivory gold",

    # Green/Herbal
    "basil": "pale green",
    "sage": "light greenish grey",
    "tea": "pale golden green",
    "moss": "deep forest green",
}

STYLE_LABELS: dict[str, str] = {
    "white_background": "White Background",
    "notes_based": "Notes Inspired",
    "model_male": "Male Model",
    "model_female": "Female Model",
    "luxury_lifestyle": "Luxury Lifestyle",
    "close_up_detail": "Close-Up Detail",
    "flat_lay": "Flat Lay",
}


class PerfumeImageService:
    """Generate styled perfume product images with full Production Bible consistency."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)
        self._image_service = ImageService(api_key=self._api_key)

    def _infer_liquid_color_from_notes(self, notes: PerfumeNotes | None) -> str:
        """Infer liquid color based on dominant fragrance notes."""
        if not notes:
            return "pale golden amber"  # Default

        all_notes = []
        if notes.top:
            all_notes.extend(notes.top)
        if notes.middle:
            all_notes.extend(notes.middle)
        if notes.base:
            all_notes.extend(notes.base)

        if not all_notes:
            return "pale golden amber"

        # Find first matching note in our color map
        for note in all_notes:
            note_lower = note.lower().strip()
            if note_lower in LIQUID_COLOR_MAP:
                return LIQUID_COLOR_MAP[note_lower]
            # Try partial match
            for key in LIQUID_COLOR_MAP:
                if key in note_lower or note_lower in key:
                    return LIQUID_COLOR_MAP[key]

        # Fallback based on note family
        note_text = " ".join(all_notes).lower()
        if any(x in note_text for x in ["citrus", "fresh", "lemon", "bergamot"]):
            return "pale golden yellow"
        elif any(x in note_text for x in ["floral", "rose", "jasmine", "flower"]):
            return "soft champagne gold with pale pink undertones"
        elif any(x in note_text for x in ["wood", "cedar", "sandalwood", "vetiver"]):
            return "warm honey amber"
        elif any(x in note_text for x in ["spice", "oriental", "amber", "vanilla"]):
            return "rich golden amber"
        elif any(x in note_text for x in ["aqua", "marine", "ocean", "water"]):
            return "pale aqua blue"
        elif any(x in note_text for x in ["fruit", "berry", "apple", "pear"]):
            return "light golden with fruity tinge"
        else:
            return "pale golden amber"

    # ─── Color Palette Helper ────────────────────────────────────

    def _get_color_palette(
        self,
        product_dna: PerfumeProductDNA | None,
        info: PerfumeInfo,
        liquid_color: str,
    ) -> str:
        """Derive a color palette reference string from DNA, notes, and liquid color."""
        colors: list[str] = []

        if product_dna:
            if product_dna.colors_primary:
                colors.append(product_dna.colors_primary)
            if product_dna.colors_secondary:
                colors.append(product_dna.colors_secondary)

        if liquid_color and liquid_color not in colors:
            colors.append(liquid_color)

        # Add mood colors based on note families
        if info.notes:
            all_notes = (info.notes.top or []) + (info.notes.middle or []) + (info.notes.base or [])
            note_text = " ".join(all_notes).lower()
            if any(x in note_text for x in ["rose", "floral", "peony", "jasmine"]):
                colors.append("soft pink")
            if any(x in note_text for x in ["wood", "cedar", "sandalwood", "oud"]):
                colors.append("warm brown")
            if any(x in note_text for x in ["citrus", "bergamot", "lemon"]):
                colors.append("golden yellow")
            if any(x in note_text for x in ["lavender", "violet"]):
                colors.append("lavender")
            if any(x in note_text for x in ["vanilla", "amber", "musk"]):
                colors.append("warm amber")
            if any(x in note_text for x in ["marine", "aqua", "fresh"]):
                colors.append("cool blue")

        # Deduplicate and limit
        seen: set[str] = set()
        unique: list[str] = []
        for c in colors:
            c_lower = c.lower()
            if c_lower not in seen:
                seen.add(c_lower)
                unique.append(c)

        return ", ".join(unique[:5]) if unique else "neutral, elegant tones"

    # ─── Style Selection & Inspiration ───────────────────────────

    def _select_styles_for_product(
        self,
        gender: str,
        images_per_product: int,
        inspiration_dna: InspirationDNA | None = None,
    ) -> list[str]:
        """Build a dynamic style pool for a product based on gender and count.

        Always starts with white_background, adds gender-appropriate model shot,
        then fills from the expanded pool.
        """
        pool: list[str] = ["white_background"]

        # Gender-appropriate model shot
        g = gender.lower()
        if g == "male":
            pool.append("model_male")
        elif g == "female":
            pool.append("model_female")
        else:
            # Unisex — alternate or pick both if enough slots
            if images_per_product >= 8:
                pool.extend(["model_male", "model_female"])
            else:
                pool.append(random.choice(["model_male", "model_female"]))

        # Core styles
        core = ["notes_based", "luxury_lifestyle", "close_up_detail", "flat_lay"]
        for s in core:
            if s not in pool:
                pool.append(s)

        # If we need more, duplicate some styles with variation
        extended = [
            "notes_based", "luxury_lifestyle", "close_up_detail",
            "flat_lay", "model_male", "model_female",
        ]
        while len(pool) < images_per_product:
            for s in extended:
                if len(pool) >= images_per_product:
                    break
                pool.append(s)

        return pool[:images_per_product]

    def _get_avatar_for_gender(
        self,
        product_gender: str,
        gender_avatars: GenderAvatarMapping | None,
    ) -> tuple[PerfumeAvatarDNA | None, list[str]]:
        """Return the correct avatar DNA + images for a product's gender."""
        if not gender_avatars:
            return None, []

        g = product_gender.lower()
        slot: GenderAvatarSlot | None = None

        if g == "male":
            slot = gender_avatars.male
        elif g == "female":
            slot = gender_avatars.female
        else:
            slot = gender_avatars.unisex

        # Fallback to unisex if the specific gender slot is empty
        if slot and not slot.images and not slot.dna:
            slot = gender_avatars.unisex

        if slot:
            return slot.dna, slot.images
        return None, []

    def _build_inspiration_section(self, inspiration_dna: InspirationDNA | None) -> str:
        """Build an inspiration style guide section for prompt injection."""
        if not inspiration_dna or not inspiration_dna.overall_summary:
            return ""

        sections = []
        sections.append("")
        sections.append("## STYLE INSPIRATION [LEARNED FROM PORTFOLIO]")
        sections.append(f"OVERALL AESTHETIC: {inspiration_dna.overall_summary}")
        sections.append("")

        if inspiration_dna.color_palettes:
            sections.append(f"COLOR PALETTE PREFERENCES: {'; '.join(inspiration_dna.color_palettes[:4])}")
        if inspiration_dna.lighting_styles:
            sections.append(f"LIGHTING PREFERENCES: {'; '.join(inspiration_dna.lighting_styles[:3])}")
        if inspiration_dna.composition_patterns:
            sections.append(f"COMPOSITION STYLE: {'; '.join(inspiration_dna.composition_patterns[:3])}")
        if inspiration_dna.mood_aesthetic:
            sections.append(f"MOOD & AESTHETIC: {'; '.join(inspiration_dna.mood_aesthetic[:3])}")
        if inspiration_dna.background_styles:
            sections.append(f"BACKGROUND PREFERENCES: {'; '.join(inspiration_dna.background_styles[:3])}")
        if inspiration_dna.prop_usage:
            sections.append(f"PROP PREFERENCES: {'; '.join(inspiration_dna.prop_usage[:3])}")

        sections.append("")
        sections.append("INSTRUCTION: Let this style DNA INFLUENCE (not override) each image's aesthetic.")
        sections.append("The inspiration should guide color choices, mood, and composition quality.")

        return "\n".join(sections)

    # ─── V2 Pipeline: Generate with Full Config ──────────────────

    async def generate_styled_images(
        self,
        perfume_info: PerfumeInfo,
        reference_images: list[str],
        product_dna: PerfumeProductDNA | None = None,
        gender_avatars: GenderAvatarMapping | None = None,
        inspiration_dna: InspirationDNA | None = None,
        images_per_product: int = 8,
        aspect_ratio: str = "1:1",
    ) -> list[dict[str, str]]:
        """Generate images for a product with full pipeline config.

        Uses gender-specific avatar selection, configurable image count,
        and inspiration DNA injection.
        """
        if not self._client:
            styles = self._select_styles_for_product(
                perfume_info.gender, images_per_product, inspiration_dna
            )
            return self._mock_results(styles)

        # Select styles based on gender and count
        styles = self._select_styles_for_product(
            perfume_info.gender, images_per_product, inspiration_dna
        )

        # Get gender-appropriate avatar
        avatar_dna, avatar_images = self._get_avatar_for_gender(
            perfume_info.gender, gender_avatars
        )

        # Build Production Bible with inspiration
        inspiration_section = self._build_inspiration_section(inspiration_dna)
        bible = self._build_production_bible(perfume_info, product_dna, avatar_dna)
        if inspiration_section:
            bible = bible + "\n" + inspiration_section

        # Load references
        loaded_product_refs = await self._image_service._load_all_images(reference_images)
        loaded_avatar_refs = []
        if avatar_images:
            loaded_avatar_refs = await self._image_service._load_all_images(avatar_images)

        logger.info(
            "Generating %d images for %s (gender=%s, %d product refs, %d avatar refs, inspiration=%s)",
            len(styles), perfume_info.perfume_name, perfume_info.gender,
            len(loaded_product_refs), len(loaded_avatar_refs),
            "yes" if inspiration_dna else "no",
        )

        results: list[dict[str, str]] = []
        for style in styles:
            try:
                is_model_shot = style in ("model_male", "model_female")

                # For model shots, use the correct gender's avatar
                shot_avatar_dna = avatar_dna
                shot_avatar_refs = loaded_avatar_refs

                if is_model_shot and gender_avatars:
                    shot_gender = "male" if style == "model_male" else "female"
                    shot_avatar_dna, shot_avatar_urls = self._get_avatar_for_gender(
                        shot_gender, gender_avatars
                    )
                    if shot_avatar_urls:
                        shot_avatar_refs = await self._image_service._load_all_images(shot_avatar_urls)

                prompt = self._build_style_prompt(
                    perfume_info, product_dna, shot_avatar_dna, style, bible, aspect_ratio
                )

                refs_for_generation = list(loaded_product_refs)
                if is_model_shot and shot_avatar_refs:
                    refs_for_generation = shot_avatar_refs + loaded_product_refs

                image_url = await self._generate_single(
                    style=style,
                    prompt=prompt,
                    reference_images=refs_for_generation,
                    num_avatar_refs=len(shot_avatar_refs) if is_model_shot else 0,
                    num_product_refs=len(loaded_product_refs),
                    aspect_ratio=aspect_ratio,
                )
                results.append({
                    "style": style,
                    "label": STYLE_LABELS.get(style, style),
                    "image_url": image_url or "",
                    "prompt": prompt,
                })
                logger.info(f"Generated {style}: {image_url}")
            except Exception as e:
                logger.exception(f"Failed to generate {style}: {e}")
                results.append({
                    "style": style,
                    "label": STYLE_LABELS.get(style, style),
                    "image_url": "",
                    "prompt": f"Error: {e}",
                })

        return results

    # ─── DNA Extraction ───────────────────────────────────────────

    async def extract_product_dna(
        self,
        image_urls: list[str],
        perfume_name: str = "",
        brand_name: str = "",
    ) -> PerfumeProductDNA:
        """Extract detailed perfume product DNA from reference images using Gemini Vision."""
        if not self._client:
            return PerfumeProductDNA(visual_description="No API key")

        loaded = await self._image_service._load_all_images(image_urls)
        if not loaded:
            return PerfumeProductDNA(visual_description="No images could be loaded")

        image_parts = []
        for img in loaded:
            if img.get("bytes"):
                image_parts.append(types.Part.from_bytes(data=img["bytes"], mime_type=img["mime_type"]))

        prompt = f"""You are an expert perfume product analyst. Analyze these reference images of a perfume bottle and extract EXTREMELY DETAILED visual DNA.

{'Product name: ' + perfume_name if perfume_name else ''}
{'Brand: ' + brand_name if brand_name else ''}

Return ONLY a valid JSON object (no markdown) with this exact structure:
{{
  "product_name": "{perfume_name or 'extract from label'}",
  "colors_primary": "dominant color of the product",
  "colors_secondary": "second most prominent color",
  "bottle_shape": "EXTREMELY detailed description of bottle shape, proportions, curves, shoulders, neck width, base thickness",
  "bottle_material": "glass type (clear/frosted/colored), quality indicators",
  "bottle_size": "estimated size (e.g., 100ml)",
  "cap_design": "EXTREMELY detailed cap description: shape, material, color, finish, texture (wood grain, metal, plastic), any decorative elements like gold bands, knurling",
  "label_design": "EXTREMELY detailed label description: position on bottle, background color, text content (EXACT transcription), font style, any patterns/borders/decorative elements, color of text and decorative elements with hex codes if possible",
  "liquid_color": "color of the perfume liquid visible through glass",
  "distinctive_features": ["list of unique visual identifiers"],
  "visual_description": "A comprehensive 4-5 sentence prose description covering bottle shape, cap, label, liquid color, materials, and overall aesthetic",
  "prohibited_variations": ["things that must NEVER change: exact colors, text, proportions, cap design, label pattern"]
}}

CRITICAL RULES:
1. Transcribe ALL visible text EXACTLY as it appears
2. Be EXTREMELY specific about colors (use descriptive names AND approximate hex codes)
3. Note EVERY decorative element on the label (patterns, borders, motifs)
4. The label_design MUST be detailed enough to reproduce the label exactly
5. The cap_design MUST capture material, texture, and any metallic accents
6. Include proportional relationships (cap height vs bottle height, label position)"""

        try:
            content_parts = image_parts + [types.Part.from_text(text=prompt)]
            response = self._client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[types.Content(role="user", parts=content_parts)],
                config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=3000),
            )

            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()

            data = json.loads(raw)
            return PerfumeProductDNA(
                product_name=data.get("product_name", perfume_name),
                colors_primary=data.get("colors_primary", ""),
                colors_secondary=data.get("colors_secondary", ""),
                bottle_shape=data.get("bottle_shape", ""),
                bottle_material=data.get("bottle_material", ""),
                bottle_size=data.get("bottle_size", "100ml"),
                cap_design=data.get("cap_design", ""),
                label_design=data.get("label_design", ""),
                liquid_color=data.get("liquid_color", ""),
                distinctive_features=data.get("distinctive_features", []),
                visual_description=data.get("visual_description", ""),
                prohibited_variations=data.get("prohibited_variations", []),
            )
        except Exception as e:
            logger.exception(f"Product DNA extraction failed: {e}")
            return PerfumeProductDNA(visual_description=f"Extraction failed: {e}")

    async def extract_avatar_dna(self, image_url: str) -> PerfumeAvatarDNA:
        """Extract avatar DNA from a model reference image using Gemini Vision."""
        if not self._client:
            return PerfumeAvatarDNA()

        loaded = await self._image_service._load_all_images([image_url])
        if not loaded:
            return PerfumeAvatarDNA()

        image_part = types.Part.from_bytes(data=loaded[0]["bytes"], mime_type=loaded[0]["mime_type"])

        prompt = """Analyze this image of a person and extract EXTREMELY DETAILED visual DNA for AI image generation consistency.

CRITICAL: Identify gender accurately. Be extremely specific about every physical detail.

Return ONLY valid JSON (no markdown):
{
  "gender": "FEMALE or MALE",
  "face": "DETAILED face shape, jawline, cheekbones, forehead, chin shape. START with gender.",
  "skin": "EXACT skin tone with undertones (warm/cool/neutral), texture, complexion, any marks/moles/freckles",
  "eyes": "Eye shape (almond/round/hooded), color (EXACT shade), brow shape/thickness/arch, eyelashes",
  "hair": "Color (EXACT shade), style, length, texture (straight/wavy/curly), parting, volume",
  "body": "Build type, approximate height category, shoulder width, overall frame",
  "ethnicity": "General ethnic appearance for skin tone/feature consistency",
  "age_range": "Estimated age range",
  "wardrobe": "Current clothing style and aesthetic",
  "prohibited_drift": "Rules to prevent character drift: specific features that MUST NOT change"
}

RULES:
1. ALWAYS explicitly state gender as FEMALE or MALE
2. Be EXTREMELY detailed about facial features - they determine consistency
3. Include skin undertone, not just 'medium' or 'fair' - specify warm olive, cool pink, neutral brown, etc.
4. Hair color should be specific: 'dark chestnut brown with subtle warm highlights' not just 'brown'
5. Eye color should be specific: 'deep brown with amber flecks' not just 'brown'"""

        try:
            response = self._client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[types.Content(role="user", parts=[image_part, types.Part.from_text(text=prompt)])],
                config=types.GenerateContentConfig(temperature=0.1, response_mime_type="application/json"),
            )

            data = json.loads(response.text.strip())
            gender = data.get("gender", "").upper()
            ethnicity = data.get("ethnicity", "")
            age = data.get("age_range", "")

            drift_rules = [
                f"MUST BE {gender}" if gender else "",
                f"maintain {ethnicity} appearance" if ethnicity else "",
                f"maintain age appearance ({age})" if age else "",
                "IDENTICAL facial structure in every frame",
                "SAME skin tone and complexion",
                "SAME hair style, length, and color",
                "SAME person throughout all images",
            ]

            return PerfumeAvatarDNA(
                gender=gender,
                face=data.get("face", ""),
                skin=data.get("skin", ""),
                eyes=data.get("eyes", ""),
                hair=data.get("hair", ""),
                body=data.get("body", ""),
                ethnicity=ethnicity,
                age_range=age,
                wardrobe=data.get("wardrobe", ""),
                prohibited_drift=" | ".join([r for r in drift_rules if r]),
            )
        except Exception as e:
            logger.exception(f"Avatar DNA extraction failed: {e}")
            return PerfumeAvatarDNA()

    # ─── Notes Fetching ───────────────────────────────────────────

    async def fetch_perfume_notes(self, inspired_by: str) -> PerfumeNotes:
        """Fetch fragrance notes for an inspired-by perfume using Gemini."""
        if not self._client:
            return PerfumeNotes()

        prompt = f"""You are a fragrance expert. Provide the fragrance notes for "{inspired_by}".

Return ONLY a valid JSON object (no markdown):
{{
  "top": ["note1", "note2", ...],
  "middle": ["note1", "note2", ...],
  "base": ["note1", "note2", ...],
  "description": "Brief 1-2 sentence description of the fragrance character"
}}

If you don't know the exact notes, provide your best educated guess based on the fragrance family."""

        try:
            response = self._client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.2, max_output_tokens=500),
            )
            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()
            data = json.loads(raw)
            return PerfumeNotes(**{k: data.get(k, [] if k != "description" else "") for k in ["top", "middle", "base", "description"]})
        except Exception as e:
            logger.exception(f"Failed to fetch notes: {e}")
            return PerfumeNotes(description=f"Could not fetch notes for {inspired_by}")

    # ─── Production Bible ─────────────────────────────────────────

    def _build_production_bible(
        self,
        info: PerfumeInfo,
        product_dna: PerfumeProductDNA | None,
        avatar_dna: PerfumeAvatarDNA | None,
    ) -> str:
        """Build a comprehensive Production Bible - immutable reference for all generation."""

        sections = []
        sections.append("=" * 60)
        sections.append("PRODUCTION BIBLE - IMMUTABLE REFERENCE")
        sections.append("=" * 60)

        # Product DNA
        sections.append("")
        sections.append("## PRODUCT DNA")
        sections.append(f"Type: perfume")
        sections.append(f"Name: {info.perfume_name}")
        sections.append(f"Brand: {info.brand_name}")
        if product_dna:
            sections.append(f"Colors: Primary={product_dna.colors_primary}")
            if product_dna.colors_secondary:
                sections.append(f"        Secondary={product_dna.colors_secondary}")
            sections.append(f"Bottle Shape: {product_dna.bottle_shape}")
            sections.append(f"Bottle Material: {product_dna.bottle_material}")
            sections.append(f"Bottle Size: {product_dna.bottle_size}")
            sections.append(f"Liquid Color: {product_dna.liquid_color}")
            sections.append("")
            sections.append(f"Visual Description: {product_dna.visual_description}")
            if product_dna.distinctive_features:
                sections.append(f"Distinctive Features: {', '.join(product_dna.distinctive_features)}")
            sections.append("")
            sections.append("┌─────────────────────────────────────────────────────────────┐")
            sections.append(f"│ CAP DESIGN [CRITICAL - MATCH EXACTLY]:                      │")
            sections.append(f"│ {product_dna.cap_design}")
            sections.append("└─────────────────────────────────────────────────────────────┘")
            sections.append("")
            sections.append("┌─────────────────────────────────────────────────────────────┐")
            sections.append(f"│ LABEL DESIGN [CRITICAL - MATCH EXACTLY]:                    │")
            sections.append(f"│ {product_dna.label_design}")
            sections.append(f"│ NOTE: Label design is IMMUTABLE. Only product name changes. │")
            sections.append("└─────────────────────────────────────────────────────────────┘")
            if product_dna.prohibited_variations:
                sections.append("")
                sections.append("PROHIBITED VARIATIONS:")
                for pv in product_dna.prohibited_variations:
                    sections.append(f"  - {pv}")

        # Fragrance Notes
        if info.notes and (info.notes.top or info.notes.middle or info.notes.base):
            sections.append("")
            sections.append("## FRAGRANCE NOTES")
            if info.notes.top:
                sections.append(f"Top: {', '.join(info.notes.top)}")
            if info.notes.middle:
                sections.append(f"Middle: {', '.join(info.notes.middle)}")
            if info.notes.base:
                sections.append(f"Base: {', '.join(info.notes.base)}")
            if info.notes.description:
                sections.append(f"Character: {info.notes.description}")

        # Avatar DNA (for model shots)
        if avatar_dna and avatar_dna.gender:
            sections.append("")
            sections.append("## CHARACTER DNA [IMMUTABLE - DO NOT CHANGE]")
            sections.append(f"Gender: {avatar_dna.gender}")
            sections.append(f"Ethnicity: {avatar_dna.ethnicity}")
            sections.append(f"Age Range: {avatar_dna.age_range}")
            sections.append(f"Face: {avatar_dna.face}")
            sections.append(f"Skin: {avatar_dna.skin}")
            sections.append(f"Eyes: {avatar_dna.eyes}")
            sections.append(f"Hair: {avatar_dna.hair}")
            sections.append(f"Body: {avatar_dna.body}")
            sections.append("")
            sections.append(f"PROHIBITED DRIFT: {avatar_dna.prohibited_drift}")

        # Realism requirements
        sections.append("")
        sections.append("## REALISM REQUIREMENTS - STRICTLY ENFORCE")
        sections.append("")
        sections.append("### SKIN")
        sections.append("Natural skin with visible pores, subtle imperfections, and realistic subsurface scattering.")
        sections.append("PROHIBITED: NO waxy, plastic, or airbrushed appearance. NO uncanny valley smoothness.")
        sections.append("")
        sections.append("### HANDS (CRITICAL)")
        sections.append("EXACTLY 5 fingers per hand. Natural finger proportions. Realistic nail beds and knuckles.")
        sections.append("PROHIBITED: NO extra fingers. NO merged fingers. NO impossible hand poses.")
        sections.append("")
        sections.append("### PRODUCT FIDELITY")
        sections.append("EXACT match to provided reference images. Correct label reproduction. Accurate material rendering.")
        sections.append(f"Bottle size is {product_dna.bottle_size if product_dna else '100ml'} — must be naturally held in hand.")
        sections.append("PROHIBITED: NO color shifts. NO text alterations. NO size distortions. NO label design changes.")
        sections.append("")
        sections.append("### TEXT/CAPTIONS")
        sections.append("DO NOT generate any on-screen text, captions, subtitles, or overlays.")
        sections.append("Text on the perfume label ONLY (from reference images).")
        sections.append("")
        sections.append("=" * 60)

        return "\n".join(sections)

    # ─── Image Generation ─────────────────────────────────────────

    async def generate_all_styles(
        self,
        perfume_info: PerfumeInfo,
        reference_images: list[str],
        product_dna: PerfumeProductDNA | None = None,
        avatar_dna: PerfumeAvatarDNA | None = None,
        avatar_reference_images: list[str] | None = None,
        styles: list[str] | None = None,
        aspect_ratio: str = "1:1",
    ) -> list[dict[str, str]]:
        """Generate images for all requested styles with Production Bible."""
        if not self._client:
            return self._mock_results(styles or ALL_STYLES)

        target_styles = list(styles) if styles else list(ALL_STYLES)

        # Auto-select model style based on gender
        if perfume_info.gender == "male":
            target_styles = [s for s in target_styles if s != "model_female"]
        elif perfume_info.gender == "female":
            target_styles = [s for s in target_styles if s != "model_male"]

        # Build Production Bible
        bible = self._build_production_bible(perfume_info, product_dna, avatar_dna)

        # Load product reference images
        loaded_product_refs = await self._image_service._load_all_images(reference_images)
        logger.info(f"Loaded {len(loaded_product_refs)} product reference images")

        # Load avatar reference images
        loaded_avatar_refs = []
        if avatar_reference_images:
            loaded_avatar_refs = await self._image_service._load_all_images(avatar_reference_images)
            logger.info(f"Loaded {len(loaded_avatar_refs)} avatar reference images")

        results: list[dict[str, str]] = []

        for style in target_styles:
            try:
                is_model_shot = style in ("model_male", "model_female")
                prompt = self._build_style_prompt(perfume_info, product_dna, avatar_dna, style, bible, aspect_ratio)

                # For model shots, include both product + avatar references
                refs_for_generation = list(loaded_product_refs)
                if is_model_shot and loaded_avatar_refs:
                    refs_for_generation = loaded_avatar_refs + loaded_product_refs

                image_url = await self._generate_single(
                    style=style,
                    prompt=prompt,
                    reference_images=refs_for_generation,
                    num_avatar_refs=len(loaded_avatar_refs) if is_model_shot else 0,
                    num_product_refs=len(loaded_product_refs),
                    aspect_ratio=aspect_ratio,
                )
                results.append({
                    "style": style,
                    "label": STYLE_LABELS.get(style, style),
                    "image_url": image_url or "",
                    "prompt": prompt,
                })
                logger.info(f"Generated {style}: {image_url}")
            except Exception as e:
                logger.exception(f"Failed to generate {style}: {e}")
                results.append({
                    "style": style,
                    "label": STYLE_LABELS.get(style, style),
                    "image_url": "",
                    "prompt": f"Error: {e}",
                })

        return results

    async def regenerate_style(
        self,
        perfume_info: PerfumeInfo,
        reference_images: list[str],
        style: str,
        product_dna: PerfumeProductDNA | None = None,
        avatar_dna: PerfumeAvatarDNA | None = None,
        avatar_reference_images: list[str] | None = None,
        aspect_ratio: str = "1:1",
    ) -> dict[str, str]:
        """Regenerate a single styled image."""
        if not self._client:
            return {"style": style, "label": STYLE_LABELS.get(style, style), "image_url": "", "prompt": "No API key"}

        bible = self._build_production_bible(perfume_info, product_dna, avatar_dna)
        loaded_product_refs = await self._image_service._load_all_images(reference_images)

        loaded_avatar_refs = []
        if avatar_reference_images:
            loaded_avatar_refs = await self._image_service._load_all_images(avatar_reference_images)

        is_model_shot = style in ("model_male", "model_female")
        prompt = self._build_style_prompt(perfume_info, product_dna, avatar_dna, style, bible, aspect_ratio)

        refs = list(loaded_product_refs)
        if is_model_shot and loaded_avatar_refs:
            refs = loaded_avatar_refs + loaded_product_refs

        image_url = await self._generate_single(
            style=style,
            prompt=prompt,
            reference_images=refs,
            num_avatar_refs=len(loaded_avatar_refs) if is_model_shot else 0,
            num_product_refs=len(loaded_product_refs),
            aspect_ratio=aspect_ratio,
        )

        return {
            "style": style,
            "label": STYLE_LABELS.get(style, style),
            "image_url": image_url or "",
            "prompt": prompt,
        }

    async def _generate_single(
        self,
        style: str,
        prompt: str,
        reference_images: list[dict],
        num_avatar_refs: int = 0,
        num_product_refs: int = 0,
        aspect_ratio: str = "1:1",
    ) -> str:
        """Generate one image with reference images."""
        reference_parts = []
        for img_data in reference_images:
            if img_data.get("bytes"):
                reference_parts.append(types.Part.from_bytes(data=img_data["bytes"], mime_type=img_data["mime_type"]))

        if not reference_parts:
            return await self._generate_text_only(style, prompt, aspect_ratio)

        # Build reference image role instructions — modeled on storyboard pipeline
        ref_lines: list[str] = []
        ref_idx = 1

        if num_avatar_refs > 0:
            ref_lines.append("""
╔══════════════════════════════════════════════════════════════════╗
║  ⚠️  CRITICAL: CHARACTER IDENTITY LOCK — READ THIS FIRST  ⚠️      ║
╠══════════════════════════════════════════════════════════════════╣
║  THIS IS THE SAME HUMAN BEING — NOT A SIMILAR PERSON            ║
║  Copy their face EXACTLY: same eyes, nose, lips, bone structure ║
║  Copy their skin EXACTLY: same tone, texture, any features      ║
║  Copy their hair EXACTLY: same color, style, texture, length    ║
║  Copy their ethnicity EXACTLY: do not change their race/heritage║
║  If reference shows a specific person, generate THAT person     ║
║  Do NOT create a "similar looking" person — it must be THEM     ║
╚══════════════════════════════════════════════════════════════════╝
""")
            ref_lines.append("CHARACTER REFERENCE IMAGES (IDENTITY SOURCE):")
            for i in range(num_avatar_refs):
                ref_lines.append(f"  • Image {ref_idx}: This is THE PERSON to generate. Clone their exact appearance.")
                ref_idx += 1
            ref_lines.append("")
            ref_lines.append("""FACE IDENTITY (CRITICAL — DO NOT DEVIATE):
✓ SAME facial bone structure (jawline, cheekbones, forehead shape)
✓ SAME eyes (exact shape, color, spacing, eyelid type)
✓ SAME nose (bridge width, tip shape, nostril size)
✓ SAME lips (exact shape, fullness, proportions)
✓ SAME eyebrows (shape, thickness, arch)
✓ SAME skin tone and undertone (warm/cool)
✓ SAME any distinctive features (moles, freckles, dimples)

THIS IS NOT A SUGGESTION — IT IS A REQUIREMENT:
- Do NOT generate a "similar looking" person
- Do NOT "improve" or "idealize" their features
- Do NOT change their ethnicity, age, or gender
- Do NOT smooth out their skin texture or features
- The person in output must be RECOGNIZABLE as the same individual
""")

        if num_product_refs > 0:
            ref_lines.append("PRODUCT REFERENCE IMAGES:")
            for i in range(num_product_refs):
                ref_lines.append(f"  • Image {ref_idx}: Product reference — match exact shape, glass color, cap, label, logo, proportions")
                ref_idx += 1
            ref_lines.append("""
PRODUCT CONSISTENCY:
✓ Same bottle shape, proportions, and form factor
✓ Same glass color and transparency
✓ Same cap design — IMMUTABLE
✓ Same label design, fonts, decorative elements — IMMUTABLE
✓ Same branding, logos, and text placement
✓ Correct scale relative to human hands
""")

        # Build verification footer for character shots
        verification = ""
        if num_avatar_refs > 0:
            verification = """
###########################################
# FINAL REMINDER: CHARACTER IDENTITY
###########################################
Before generating, verify:
→ Is this THE SAME PERSON from the reference images?
→ Would someone recognize this as the same individual?
→ Are all facial features IDENTICAL (not similar)?
Generate the image now — same person, same product, zero text overlays."""

        ref_header = "\n".join(ref_lines)
        full_prompt = ref_header + "\n" + prompt + "\n" + verification

        content_parts = reference_parts + [types.Part.from_text(text=full_prompt)]

        models_to_try = [
            "gemini-2.5-flash-image",
            "gemini-3-pro-image-preview",
            "gemini-2.0-flash-exp-image-generation",
        ]

        for model_name in models_to_try:
            try:
                logger.info(f"Trying {model_name} for {style} ({num_avatar_refs} avatar + {num_product_refs} product refs)")

                config = types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                    image_config=types.ImageConfig(
                        aspect_ratio=aspect_ratio,
                        person_generation="ALLOW_ALL",
                    ),
                )

                response = self._client.models.generate_content(
                    model=model_name,
                    contents=[types.Content(role="user", parts=content_parts)],
                    config=config,
                )

                if response.candidates:
                    candidate = response.candidates[0]
                    if candidate.content and candidate.content.parts:
                        for part in candidate.content.parts:
                            if hasattr(part, "inline_data") and part.inline_data:
                                image_bytes = part.inline_data.data
                                if image_bytes:
                                    logger.info(f"{model_name}: {len(image_bytes)} bytes for {style}")
                                    return await self._save_image(image_bytes, style, aspect_ratio)

                logger.warning(f"{model_name} returned no image for {style}")
            except Exception as e:
                logger.warning(f"{model_name} failed for {style}: {e}")
                continue

        logger.warning(f"All models failed for {style}, falling back to Imagen")
        return await self._generate_text_only(style, prompt, aspect_ratio)

    async def _generate_text_only(self, style: str, prompt: str, aspect_ratio: str = "1:1") -> str:
        try:
            response = self._client.models.generate_images(
                model="imagen-4.0-fast-generate-001",
                prompt=prompt,
                config=types.GenerateImagesConfig(number_of_images=1, aspect_ratio=aspect_ratio),
            )
            if response.generated_images:
                image = response.generated_images[0]
                if hasattr(image, "image") and image.image and hasattr(image.image, "image_bytes") and image.image.image_bytes:
                    return await self._save_image(image.image.image_bytes, style, aspect_ratio)
            return ""
        except Exception as e:
            logger.exception(f"Imagen fallback failed for {style}: {e}")
            return ""

    async def _save_image(self, image_bytes: bytes, style: str, aspect_ratio: str = "1:1") -> str:
        backend_dir = Path(__file__).resolve().parents[2]
        frontend_dir = backend_dir.parent / "frontend"
        uploads_dir = frontend_dir / "public" / "uploads" / "perfume"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        processed_bytes = await self._image_service._enforce_aspect_ratio(image_bytes, aspect_ratio)

        filename = f"{style}-{uuid.uuid4().hex[:8]}.png"
        filepath = uploads_dir / filename

        with open(filepath, "wb") as f:
            f.write(processed_bytes)

        image_url = f"/uploads/perfume/{filename}"
        logger.info(f"Saved: {image_url}")
        return image_url

    # ─── Style-Specific Prompt Builders ───────────────────────────

    def _build_style_prompt(
        self,
        info: PerfumeInfo,
        product_dna: PerfumeProductDNA | None,
        avatar_dna: PerfumeAvatarDNA | None,
        style: str,
        bible: str,
        aspect_ratio: str = "1:1",
    ) -> str:
        """Build a complete prompt with Production Bible + style-specific scene.

        Follows a structured format:
        1. Reference image instruction header
        2. Style + aesthetic description
        3. Detailed BOTTLE/CAP/LABEL sections from DNA (bullet points)
        4. Scene-specific sections (PROPS, SETTING, SURFACE, LIGHTING, MOOD)
        5. COLOR PALETTE REFERENCE
        6. OUTPUT quality description
        """

        # Determine liquid color
        liquid_color = ""
        if product_dna and product_dna.liquid_color:
            liquid_color = product_dna.liquid_color
        else:
            liquid_color = self._infer_liquid_color_from_notes(info.notes)

        # Derive color palette
        color_palette = self._get_color_palette(product_dna, info, liquid_color)

        # Build structured product description (bullet-pointed per your example)
        product_desc = self._build_product_description(info, product_dna, liquid_color)

        # Scene description (style-specific)
        scene = self._get_style_scene(info, product_dna, avatar_dna, style, liquid_color, color_palette)

        aspect_info = self._image_service._get_aspect_ratio_info(aspect_ratio)

        return f"""REFERENCE IMAGES PROVIDED - Study bottle, cap, label carefully before generating.

{scene}

{product_desc}

{bible}

OUTPUT: Photorealistic, high-end perfume photography, sharp focus on bottle details, professional advertising quality, {aspect_info['ratio']} ratio ({aspect_info['width']}x{aspect_info['height']} pixels). NO text overlays, watermarks, captions, or generated text EXCEPT product name on bottle label. NOT illustrated, cartoon, 3D render, or AI-looking. Reference images are LAW."""

    def _build_product_description(
        self,
        info: PerfumeInfo,
        product_dna: PerfumeProductDNA | None,
        liquid_color: str,
    ) -> str:
        """Build a detailed, bullet-pointed product description from DNA."""
        sections: list[str] = []

        if product_dna and product_dna.visual_description:
            # BOTTLE section — bullet points from DNA
            sections.append("BOTTLE [MATCH REFERENCE IMAGE EXACTLY]:")
            for line in product_dna.bottle_shape.split(". "):
                line = line.strip().rstrip(".")
                if line:
                    sections.append(f"- {line}")
            if product_dna.bottle_material:
                sections.append(f"- {product_dna.bottle_material}")
            sections.append(f"- {liquid_color} perfume liquid at 75-85% fill level")
            if product_dna.bottle_size:
                sections.append(f"- Size: {product_dna.bottle_size} — approximately 6-8 inches (15-20cm) tall including cap")
            sections.append("")

            # CAP section — bullet points from DNA
            sections.append("CAP [MATCH REFERENCE IMAGE EXACTLY]:")
            for line in product_dna.cap_design.split(". "):
                line = line.strip().rstrip(".")
                if line:
                    sections.append(f"- {line}")
            sections.append("- Cap sits securely on bottle with premium fit")
            sections.append("")

            # LABEL section — bullet points from DNA
            sections.append("LABEL [wrapped around bottle - STUDY REFERENCE IMAGE]:")
            for line in product_dna.label_design.split(". "):
                line = line.strip().rstrip(".")
                if line:
                    sections.append(f"- {line}")
            sections.append(f'- Product name "{info.perfume_name}" and brand text visible within label area')
            sections.append("- Label design (pattern, colors, decorative elements) is IMMUTABLE from reference images")
            sections.append("")

        else:
            # Minimal product description when no DNA available
            sections.append(f"PRODUCT: {info.perfume_name} by {info.brand_name}")
            sections.append(f"SIZE: 100ml perfume bottle — approximately 6-8 inches (15-20cm) tall including cap")
            sections.append("")
            sections.append("BOTTLE/CAP/LABEL [MATCH REFERENCE IMAGES EXACTLY]:")
            sections.append("- Study the reference images carefully BEFORE generating")
            sections.append("- Match bottle shape, proportions, cap design, label pattern EXACTLY")
            sections.append("- The bottle, cap, and label design are IMMUTABLE from reference images")
            sections.append(f'- Only the product name "{info.perfume_name}" on the label may differ')
            sections.append(f"- Perfume liquid color: {liquid_color} at 75-85% fill level")
            sections.append("")

        return "\n".join(sections)

    def _build_avatar_dna_section(self, avatar_dna: PerfumeAvatarDNA | None, scene_wardrobe: str = "") -> str:
        """Build a structured avatar DNA section matching the detailed format:
        Gender, Face, Skin, Eyes, Hair, Body, Ethnicity, Age Range, Wardrobe, Prohibited Drift."""
        if not avatar_dna or not avatar_dna.gender:
            return ""

        wardrobe = scene_wardrobe or avatar_dna.wardrobe or "Elegant, context-appropriate attire"

        return f"""Gender:
{avatar_dna.gender}
Face:
{avatar_dna.face}
Skin:
{avatar_dna.skin}
Eyes:
{avatar_dna.eyes}
Hair:
{avatar_dna.hair}
Body:
{avatar_dna.body}
Ethnicity:
{avatar_dna.ethnicity}
Age Range:
{avatar_dna.age_range}
Wardrobe:
{wardrobe}
Prohibited Drift:
{avatar_dna.prohibited_drift}"""

    def _get_style_scene(
        self,
        info: PerfumeInfo,
        product_dna: PerfumeProductDNA | None,
        avatar_dna: PerfumeAvatarDNA | None,
        style: str,
        liquid_color: str = "pale golden amber",
        color_palette: str = "neutral, elegant tones",
    ) -> str:
        name = info.perfume_name
        bottle_size = product_dna.bottle_size if product_dna else "100ml"
        gender = (info.gender or "unisex").lower()

        if style == "white_background":
            return f"""Clean Marketplace Hero aesthetic. 1:1 SQUARE ratio.

PROPS/ELEMENTS: None — bottle only, centered composition
SETTING: Clean light grey (#E8E8E8) seamless studio backdrop
SURFACE: Light grey gradient floor blending seamlessly into background, NO visible horizon line
LIGHTING: Soft diffused studio lighting from front-45° angle, gentle fill light from opposite side, minimal contact shadow under bottle, even illumination, NO dramatic shadows, glass renders with natural light refraction and subtle reflections
MOOD: E-commerce hero shot, clean, professional, marketplace ready, Amazon/Sephora listing quality

COMPOSITION:
- {name} perfume bottle standing upright, perfectly centered in frame
- Bottle occupies ~60-70% of frame height
- Equal negative space on left and right sides
- Small breathing room at top and bottom
- Cap ON the bottle (not removed or placed beside)
- Crystal-clear glass with visible {liquid_color} liquid inside at 75-85% fill
- Label wrapped around bottle, fully legible with product name "{name}" prominently displayed
- Natural glass reflections and transparency
- Sharp focus throughout entire bottle

COLOR PALETTE REFERENCE: {color_palette}"""

        elif style == "notes_based":
            top = ", ".join(info.notes.top) if info.notes and info.notes.top else "citrus, bergamot"
            mid = ", ".join(info.notes.middle) if info.notes and info.notes.middle else "floral, jasmine"
            base = ", ".join(info.notes.base) if info.notes and info.notes.base else "woody, musk"

            scene = random.choice(NOTES_BASED_SCENES)

            return f"""Fragrance Notes Artistic Composition aesthetic. 1:1 SQUARE ratio. Inspired by {scene['mood']} photography.

PROPS/ELEMENTS:
- Surrounded by REAL, FRESH, physical ingredients representing the fragrance notes:
  * Top notes ({top}): vibrant, dewy, freshly harvested ingredients — NOT dried or artificial
  * Heart notes ({mid}): blooming flowers or aromatic herbs at peak freshness
  * Base notes ({base}): rich woods, resins, warm natural materials
- Cap removed and placed beside bottle to show nozzle/sprayer
- Ingredients scattered artfully around bottle, creating depth and visual interest

SETTING: {scene['backdrop']}
SURFACE: Complementary textured surface that enhances the mood
LIGHTING: {scene['lighting']}
MOOD: {scene['mood']} — {scene['style_notes']}

COMPOSITION:
- {name} bottle prominently featured, {scene['arrangement']}
- Bottle clearly visible with label legible amid the ingredients
- Liquid color: {liquid_color} at 75-85% fill, visible through glass
- Each ingredient looks alive, dewy, freshly picked — as if just gathered
- Professional food/product photography level of ingredient styling

COLOR PALETTE REFERENCE: {color_palette}

CRITICAL: This scene must look DIFFERENT from other products' notes-based shots. Every product gets its own unique Pinterest-quality composition."""

        elif style == "model_male":
            scene_var = random.choice(LIFESTYLE_MALE_SCENES)

            if avatar_dna and avatar_dna.gender:
                char_section = self._build_avatar_dna_section(avatar_dna, scene_var['wardrobe'])
            else:
                char_section = f"""Gender:
MALE
Face:
Handsome male model with defined jawline, age 25-35, well-groomed, confident expression
Wardrobe:
{scene_var['wardrobe']}
Prohibited Drift:
MUST BE MALE | maintain consistent appearance | IDENTICAL facial structure in every frame | SAME person throughout all images"""

            return f"""Male Model Lifestyle Shot aesthetic. 1:1 SQUARE ratio. Inspired by {scene_var['mood']} photography.

({char_section}
)

SETTING: {scene_var['setting']}
SURFACE: Context-appropriate premium surface visible in scene
LIGHTING: Warm cinematic lighting with shallow depth of field (f/2.8), bottle in SHARP focus, professional lifestyle campaign quality
MOOD: {scene_var['mood']}

POSE & BOTTLE INTERACTION:
- {scene_var['pose']}
- Model holding the {name} bottle ({bottle_size}) NATURALLY in his hand
- HAND PHYSICS: bottle rests securely in palm, fingers wrap naturally around sides
- Thumb on one side, four fingers on other — natural grip, EXACTLY 5 fingers per hand
- Bottle visible with label legible, product is hero even with model
- Natural realistic nail beds and knuckles on hands

SKIN RENDERING:
- Ultra-realistic skin: visible pores, natural texture, realistic subsurface scattering
- NO waxy, plastic, or airbrushed appearance — NO uncanny valley smoothness
- Natural skin imperfections that make the person look REAL

COLOR PALETTE REFERENCE: {color_palette}

CRITICAL: The MODEL stays identical (character DNA above), only the SCENE changes between products."""

        elif style == "model_female":
            scene_var = random.choice(LIFESTYLE_FEMALE_SCENES)

            if avatar_dna and avatar_dna.gender:
                char_section = self._build_avatar_dna_section(avatar_dna, scene_var['wardrobe'])
            else:
                char_section = f"""Gender:
FEMALE
Face:
Elegant female model with graceful features, age 25-35, poised, natural beauty
Wardrobe:
{scene_var['wardrobe']}
Prohibited Drift:
MUST BE FEMALE | maintain consistent appearance | IDENTICAL facial structure in every frame | SAME person throughout all images"""

            return f"""Female Model Lifestyle Shot aesthetic. 1:1 SQUARE ratio. Inspired by {scene_var['mood']} photography.

({char_section}
)

SETTING: {scene_var['setting']}
SURFACE: Context-appropriate premium surface visible in scene
LIGHTING: Soft flattering lighting — natural window light or golden hour warmth, shallow depth of field (f/2.0), dreamy atmosphere
MOOD: {scene_var['mood']}

POSE & BOTTLE INTERACTION:
- {scene_var['pose']}
- Model holding the {name} bottle ({bottle_size}) DELICATELY
- HAND PHYSICS: elegant fingertip grip, bottle between thumb and fingers
- Natural feminine hand pose — graceful, not stiff, EXACTLY 5 fingers per hand
- Bottle visible with label legible, product is hero
- Natural realistic nail beds and knuckles on hands

SKIN RENDERING:
- Ultra-realistic skin: natural texture, visible pores, realistic subsurface scattering
- NO waxy, plastic, or airbrushed appearance — NO uncanny valley smoothness
- Natural skin that makes the person look REAL, not a doll

COLOR PALETTE REFERENCE: {color_palette}

CRITICAL: The MODEL stays identical (character DNA above), only the SCENE changes between products."""

        elif style == "luxury_lifestyle":
            return f"""Luxury Lifestyle Still Life aesthetic. 1:1 SQUARE ratio. Inspired by sophisticated editorial product photography.

PROPS/ELEMENTS:
- Minimal curated luxury props: leather journal, silk pocket square, gold watch, or a single stem flower
- NO human model — pure product lifestyle
- Cap next to bottle, slightly angled
- Rich textures: marble veins, silk sheen, leather grain, glass reflections

SETTING: Dimly lit luxury vanity or premium marble countertop with sophisticated ambiance
SURFACE: Polished marble with white and gold veining, dark granite, or brushed gold tray
LIGHTING: Warm moody golden tones — side light from 45° casting long dramatic shadows, Rembrandt-style lighting with high contrast, metallic reflections on cap and glass
MOOD: Opulent, magazine-quality, every element perfectly placed, rich textures, undeniable luxury

COMPOSITION:
- {name} bottle as the undeniable focal point — shot from slight low angle for grandeur
- Liquid color: {liquid_color} at 75-85% fill, visible through glass, catching light beautifully
- Color palette: warm golds, deep blacks, rich cognac tones
- Dramatic interplay of light and shadow emphasizing bottle form and materials
- Professional commercial still-life photography standard

COLOR PALETTE REFERENCE: {color_palette}"""

        elif style == "close_up_detail":
            cap_desc = product_dna.cap_design if product_dna else "the cap design from reference images"
            label_desc = product_dna.label_design if product_dna else "the label from reference images"

            closeup_var = random.choice(CLOSEUP_SCENES)

            return f"""Macro Close-Up Detail Shot aesthetic. 1:1 SQUARE ratio. Inspired by premium product macro photography.

PROPS/ELEMENTS: None — bottle detail only, extreme close-up
SETTING: {closeup_var['background']}
LIGHTING: Premium studio lighting revealing material textures — glass refractions, metallic reflections, {closeup_var['detail']}
MOOD: Quality, craftsmanship, premium positioning, tactile luxury

COMPOSITION:
- Focus: {closeup_var['focus']}
- Extreme close-up of the {name} bottle showcasing fine craftsmanship
- Ultra-shallow depth of field — razor-sharp on focal point, beautiful bokeh elsewhere
- Detail emphasis: {closeup_var['detail']}

BOTTLE DETAILS IN FOCUS:
- Cap: {cap_desc}
- Label: {label_desc}
- Glass transparency showing {liquid_color} perfume liquid
- Macro-level detail visible: material grain, glass clarity, label texture, printing quality
- Every surface texture communicates premium quality

COLOR PALETTE REFERENCE: {color_palette}

CRITICAL: This close-up angle must be DIFFERENT from other products' detail shots."""

        elif style == "flat_lay":
            notes_items = ""
            if info.notes and info.notes.top:
                items = info.notes.top[:2] + (info.notes.base[:1] if info.notes.base else [])
                notes_items = f", sprigs of {', '.join(items)}"

            flatlay_var = random.choice(FLAT_LAY_SCENES)
            gender_props = "leather strap, dark sunglasses, minimalist watch" if gender == "male" else "pearl earring, dried rose petals, silk ribbon, delicate necklace"

            return f"""Flat Lay Top-Down Composition aesthetic. 1:1 SQUARE ratio. Inspired by Instagram-worthy product flat lay photography.

PROPS/ELEMENTS:
- {flatlay_var['props']}
- Gender-appropriate curated items: {gender_props}{notes_items}
- Cap separated and placed at aesthetic angle
- Color-coordinated props that complement the bottle's palette
- Every element placed with intention — nothing random

SETTING: Camera PERFECTLY overhead / bird's eye view (90 degrees straight down)
SURFACE: {flatlay_var['surface']}
LIGHTING: {flatlay_var['lighting']}
MOOD: Curated, Instagram-worthy, intentional, aspirational lifestyle

COMPOSITION:
- {flatlay_var['arrangement']}
- {name} bottle positioned as focal point (can be upright or laid showing label)
- Liquid color: {liquid_color} at 75-85% fill, visible through glass
- Intentional negative space creating visual breathing room
- Asymmetrical balance with golden ratio positioning

COLOR PALETTE REFERENCE: {color_palette}"""

        return f"""Professional Product Photography aesthetic. 1:1 SQUARE ratio.
SETTING: Professional studio with neutral background
LIGHTING: Well-lit, even illumination, minimal shadows
MOOD: Elegant, professional, clean composition
COMPOSITION: {name} perfume bottle, centered, sharp focus, label visible

COLOR PALETTE REFERENCE: {color_palette}"""

    # ─── Mock ─────────────────────────────────────────────────────

    @staticmethod
    def _mock_results(styles: list[str]) -> list[dict[str, str]]:
        return [
            {
                "style": s,
                "label": STYLE_LABELS.get(s, s),
                "image_url": f"https://placehold.co/1080x1080/6366f1/white?text={s.replace('_', '+')}",
                "prompt": f"Mock: {s}",
            }
            for s in styles
        ]
