import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const systemAvatars = [
  {
    name: "Aria Sharma",
    tag: "Luxury Perfume Model",
    isSystem: true,
    thumbnailUrl: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=400&fit=crop&crop=face",
    referenceImages: [
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=800&fit=crop",
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&fit=crop",
    ],
    dna: {
      gender: "FEMALE",
      face: "FEMALE - oval, sharp jawline, high cheekbones, feminine features",
      skin: "warm bronze, dewy finish",
      eyes: "deep brown, almond-shaped, thick lashes",
      hair: "jet black, waist-length, silk straight",
      body: "FEMALE build, 5'8, lean athletic",
      voice: "warm contralto, slight Hindi accent",
      wardrobe: "designer minimalist",
      ethnicity: "South Asian",
      age_range: "25-30",
      prohibited_drift: "MUST BE FEMALE | no freckles | no curly hair | no blue eyes | maintain South Asian appearance",
    },
  },
  {
    name: "Rameshwar Singh",
    tag: "Cancer Awareness Advocate",
    isSystem: true,
    thumbnailUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop&crop=face",
    referenceImages: [
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&fit=crop",
    ],
    dna: {
      gender: "MALE",
      face: "MALE - round, broad forehead, gentle features, masculine bone structure",
      skin: "medium brown, matte",
      eyes: "dark brown, warm, slightly hooded",
      hair: "bald (chemotherapy)",
      body: "MALE build, 5'10, thin, slightly frail",
      voice: "deep baritone, Hindi accent, emotional",
      wardrobe: "simple cotton kurta",
      ethnicity: "South Asian",
      age_range: "50-60",
      prohibited_drift: "MUST BE MALE | no hair | no muscular build | no western clothing | maintain South Asian appearance",
    },
  },
  {
    name: "Brand Muse",
    tag: "European Fashion Model",
    isSystem: true,
    thumbnailUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop&crop=face",
    referenceImages: [
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&fit=crop",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&fit=crop",
    ],
    dna: {
      gender: "FEMALE",
      face: "FEMALE - angular, defined cheekbones, narrow chin, feminine elegance",
      skin: "fair porcelain, natural flush",
      eyes: "blue-green, round, defined brows",
      hair: "platinum blonde, shoulder-length, loose waves",
      body: "FEMALE build, 5'9, slim",
      voice: "soft soprano, neutral European accent",
      wardrobe: "high fashion editorial",
      ethnicity: "Caucasian/European",
      age_range: "22-28",
      prohibited_drift: "MUST BE FEMALE | no dark hair | no tanned skin | no casual wear | maintain European appearance",
    },
  },
  {
    name: "Marcus Chen",
    tag: "Tech Entrepreneur",
    isSystem: true,
    thumbnailUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face",
    referenceImages: [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&fit=crop",
    ],
    dna: {
      gender: "MALE",
      face: "MALE - oval, clean-shaven, confident expression, strong masculine jawline",
      skin: "light olive, clear complexion",
      eyes: "dark brown, alert, natural brows",
      hair: "black, short professional cut, neat",
      body: "MALE build, 5'11, fit",
      voice: "clear tenor, American accent, articulate",
      wardrobe: "smart casual tech executive",
      ethnicity: "East Asian",
      age_range: "30-35",
      prohibited_drift: "MUST BE MALE | no facial hair | no long hair | maintain East Asian appearance",
    },
  },
  {
    name: "Priya Patel",
    tag: "Wellness Influencer",
    isSystem: true,
    thumbnailUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&crop=face",
    referenceImages: [
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&fit=crop",
    ],
    dna: {
      gender: "FEMALE",
      face: "FEMALE - heart-shaped, soft features, warm smile, feminine grace",
      skin: "medium tan, healthy glow",
      eyes: "brown, expressive, natural makeup",
      hair: "dark brown, long, natural waves",
      body: "FEMALE build, 5'6, yoga fit",
      voice: "warm mezzo, Indian-American accent",
      wardrobe: "athleisure, earthy tones",
      ethnicity: "South Asian",
      age_range: "28-32",
      prohibited_drift: "MUST BE FEMALE | no pale skin | maintain South Asian appearance | always healthy glow",
    },
  },
];

async function main() {
  console.log("Seeding system avatars...");

  for (const avatar of systemAvatars) {
    const existing = await prisma.avatar.findFirst({
      where: {
        name: avatar.name,
        isSystem: true,
      },
    });

    if (existing) {
      await prisma.avatar.update({
        where: { id: existing.id },
        data: avatar,
      });
      console.log(`  Updated: ${avatar.name}`);
    } else {
      await prisma.avatar.create({
        data: avatar,
      });
      console.log(`  Created: ${avatar.name}`);
    }
  }

  console.log("Seed complete.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
