import React, { createContext, useContext, useState, useEffect, useRef } from "react"
import type {
  UserProfile,
  WardrobeItem,
  RecentLook,
  AppNotification,
  PersonaId,
  Outfit,
  OutfitItem,
  Direction,
  WeatherData,
  QuizResult,
  FontScale,
  AccessibleFont,
  FavoriteOutfit,
  FavoriteOutfitItem,
} from "../types"
import { getContrastTextColor } from "../types"
import { THEME_COLORS } from "../types/theme"
import {
  PERSONA_WARDROBES,
  PERSONA_RECENT_LOOKS,
  ensureSeededTryOnItems,
  getWardrobeForPersona,
  getRecentLooksForPersona,
  getSampleGarmentImage,
} from "../data/personaData"
import { fetchLiveWeather } from "../services/weatherService"

export { getContrastTextColor }

export const PRESET_PERSONAS: Record<PersonaId, UserProfile> = {
  eliora: {
    id: "eliora",
    name: "Eliora Browning",
    initials: "EB",
    email: "eliora.browning@example.com",
    avatarBg: THEME_COLORS.rose,
    roleTitle: "Soft Fabrics & Comfort",
    preferredStyle: "Polished · colorful · comfortable",
    typicalSizes: "Tops 3XL · Bottoms 26/28 · Shoes 9",
    homeClimate: "Preferably cold (50-65°F)",
    stylistNotes:
      "Prefers pastel goth outfits. Likes pastel pinks, burgundies, black, as well as occasional unexpected splashes of color and unique accessories. Very picky about fabric textures.",
    accessibility: {
      highContrastColors: false,
      sensorySensitive: true,
      lowDecisionMode: true,
      voiceNarration: false,
      largeText: false,
      visionImpairment: false,
    },
  },
  ethan: {
    id: "ethan",
    name: "Ethan Carter",
    initials: "EC",
    email: "ethan.carter@example.com",
    avatarBg: THEME_COLORS.darkTeal,
    roleTitle: "Networking & Events",
    preferredStyle: "Sharp business-casual · structured · clean lines",
    typicalSizes: "Tops L · Bottoms 32 · Shoes 10.5",
    homeClimate: "Breezy & urban (64°F)",
    stylistNotes:
      "Needs clear interpretation of ambiguous dress codes for networking dinners.",
    accessibility: {
      highContrastColors: false,
      sensorySensitive: false,
      lowDecisionMode: false,
      voiceNarration: false,
      largeText: false,
      visionImpairment: false,
    },
  },
  jordan: {
    id: "jordan",
    name: "Jordan Miller",
    initials: "JM",
    email: "jordan.miller@example.com",
    avatarBg: THEME_COLORS.green,
    roleTitle: "Simple Everyday Style",
    preferredStyle: "Minimalist · earth tones · relaxed fit",
    typicalSizes: "Tops M · Bottoms 30 · Shoes 10",
    homeClimate: "Mild & sunny (72°F)",
    stylistNotes:
      "Suffers from morning decision fatigue; wants AI to rediscover unworn clothes in his closet.",
    accessibility: {
      highContrastColors: false,
      sensorySensitive: false,
      lowDecisionMode: true,
      voiceNarration: false,
      largeText: false,
      visionImpairment: false,
    },
  },
  josephine: {
    id: "josephine",
    name: "Josephine Davis",
    initials: "JD",
    email: "josephine.davis@example.com",
    avatarBg: THEME_COLORS.gold,
    roleTitle: "High Contrast & Audio",
    preferredStyle: "High-contrast · soft natural fibers · easy tags",
    typicalSizes: "Tops S · Bottoms 6 · Shoes 7.5",
    homeClimate: "Moderate (70°F)",
    stylistNotes:
      "Relies on high-contrast text color names and tactile fabric pairings due to mild visual impairment.",
    accessibility: {
      highContrastColors: true,
      sensorySensitive: true,
      lowDecisionMode: false,
      voiceNarration: true,
      largeText: true,
      visionImpairment: true,
    },
  },
  areeba: {
    id: "areeba",
    name: "Areeba Ahmad",
    initials: "AA",
    email: "areeba.ahmad@example.com",
    avatarBg: THEME_COLORS.red,
    roleTitle: "Business Classic",
    preferredStyle: "Creative chic · dynamic layers · statement accents",
    typicalSizes: "Tops S · Bottoms 4 · Shoes 7",
    homeClimate: "Humid subtropical (75°F)",
    stylistNotes:
      "Loves bold creative palettes with gold accents and Snoopy-themed outfits.",
    accessibility: {
      highContrastColors: false,
      sensorySensitive: false,
      lowDecisionMode: false,
      voiceNarration: false,
      largeText: false,
      visionImpairment: false,
    },
  },
}

export const INITIAL_ITEMS: WardrobeItem[] = [
  {
    id: 1,
    name: "Magenta button-down",
    category: "Tops",
    color: THEME_COLORS.pink,
    colorName: "Vivid Magenta",
    imageData: "/wardrobe/magenta-button-down.png",
    worn: 12,
    favorite: true,
    material: "100% Breathable Rayon",
    storageLocation: "Closet · Rack 1 (Left)",
    careInstructions: "Cold gentle wash with similar colors · hang dry",
    sentimentalValue: "High",
    cost: "$48",
    status: "clean",
  },
  {
    id: 2,
    name: "Navy crew tee",
    category: "Tops",
    color: "#2B4B8C",
    colorName: "Deep Navy",
    imageData: "/wardrobe/navy-crew-tee.png",
    worn: 34,
    favorite: false,
    material: "Pima Cotton Jersey (Tagless)",
    storageLocation: "Dresser · Top Drawer",
    careInstructions: "Machine wash warm · tumble dry medium",
    sentimentalValue: "Medium",
    cost: "$24",
    status: "clean",
  },
  {
    id: 3,
    name: "Mint ribbed mock-neck",
    category: "Tops",
    color: THEME_COLORS.lightGreen,
    colorName: "Soft Mint",
    imageData: "/wardrobe/mint-ribbed-mock-neck.png",
    worn: 4,
    favorite: false,
    material: "Organic Cotton Knit",
    storageLocation: "Closet · Shelf 2 Folded",
    careInstructions: "Hand wash cold · reshape flat · avoid dryer",
    sentimentalValue: "Medium",
    cost: "$52",
    status: "clean",
  },
  {
    id: 4,
    name: "Cream linen blouse",
    category: "Tops",
    color: "#F5EFD8",
    colorName: "Warm Off-White",
    imageData: "/wardrobe/cream-linen-blouse.png",
    worn: 8,
    favorite: true,
    material: "100% European Flax Linen",
    storageLocation: "Closet · Rack 1",
    careInstructions: "Delicate cold cycle · steam if needed",
    sentimentalValue: "High",
    cost: "$65",
    status: "clean",
  },
  {
    id: 5,
    name: "Slim medium jeans",
    category: "Bottoms",
    color: "#4A6FA5",
    colorName: "Medium Indigo Denim",
    imageData: "/wardrobe/slim-medium-jeans.png",
    worn: 45,
    favorite: true,
    material: "98% Cotton, 2% Elastane",
    storageLocation: "Closet · Pants Hanger",
    careInstructions: "Wash inside out with cold water · line dry",
    sentimentalValue: "Medium",
    cost: "$78",
    status: "clean",
  },
  {
    id: 6,
    name: "Camel wide trousers",
    category: "Bottoms",
    color: "#C8965A",
    colorName: "Warm Camel",
    imageData: "/wardrobe/camel-wide-trousers.png",
    worn: 18,
    favorite: false,
    material: "Wool Blend Twill (Soft Lined)",
    storageLocation: "Closet · Rack 2",
    careInstructions: "Dry clean or cold wool cycle · low iron",
    sentimentalValue: "High",
    cost: "$92",
    status: "clean",
  },
  {
    id: 7,
    name: "Black wide-leg trousers",
    category: "Bottoms",
    color: "#1A1A2E",
    colorName: "Midnight Black",
    imageData: "/wardrobe/black-wide-leg-trousers.png",
    worn: 22,
    favorite: true,
    material: "Drapey Crepe Poly-Viscose",
    storageLocation: "Closet · Rack 2",
    careInstructions: "Machine wash cold · tumble dry low",
    sentimentalValue: "Medium",
    cost: "$60",
    status: "clean",
  },
  {
    id: 8,
    name: "White leather sneakers",
    category: "Shoes",
    color: "#F2F2F2",
    colorName: "Crisp White",
    imageData: "/wardrobe/white-leather-sneakers.png",
    worn: 60,
    favorite: true,
    material: "Full Grain Leather & Memory Foam",
    storageLocation: "Shoe Rack · Entryway",
    careInstructions: "Wipe clean with damp cloth · leather balm",
    sentimentalValue: "High",
    cost: "$110",
    status: "clean",
  },
  {
    id: 9,
    name: "Tan leather loafers",
    category: "Shoes",
    color: "#B8825A",
    colorName: "Cognac Brown",
    imageData: "/wardrobe/tan-leather-loafers.png",
    worn: 15,
    favorite: false,
    material: "Vegetable-tanned leather",
    storageLocation: "Shoe Cabinet · Shelf 1",
    careInstructions: "Condition monthly · avoid rain soaking",
    sentimentalValue: "Medium",
    cost: "$135",
    status: "clean",
  },
  {
    id: 10,
    name: "Chunky platform sneakers",
    category: "Shoes",
    color: "#E8E8E8",
    colorName: "Cloud Grey / White",
    imageData: "/wardrobe/chunky-platform-sneakers.png",
    worn: 7,
    favorite: false,
    material: "Canvas & Lightweight EVA Sole",
    storageLocation: "Shoe Rack · Entryway",
    careInstructions: "Spot clean canvas with gentle detergent",
    sentimentalValue: "Low",
    cost: "$75",
    status: "clean",
  },
  {
    id: 11,
    name: "Teal trench coat",
    category: "Outerwear",
    color: THEME_COLORS.darkTeal,
    colorName: "Deep Teal",
    imageData: "/wardrobe/teal-trench-coat.png",
    worn: 9,
    favorite: true,
    material: "Water-resistant Cotton Gabardine",
    storageLocation: "Entry Hallway Coat Hook",
    careInstructions: "Cold gentle cycle · do not bleach · hang dry",
    sentimentalValue: "High",
    cost: "$160",
    status: "clean",
  },
  {
    id: 12,
    name: "Gold hoop earrings",
    category: "Accessories",
    color: THEME_COLORS.gold,
    colorName: "Warm 18K Gold",
    imageData: "/wardrobe/gold-hoop-earrings.png",
    worn: 50,
    favorite: true,
    material: "Hypoallergenic Gold Vermeil",
    storageLocation: "Jewelry Box · Vanity Top",
    careInstructions: "Polish with microfiber cloth",
    sentimentalValue: "High",
    cost: "$45",
    status: "clean",
  },
  {
    id: 13,
    name: "Blue jeans",
    category: "Bottoms",
    color: "#315A91",
    colorName: "Classic Blue Denim",
    imageData: "/wardrobe/blue-jeans.png",
    worn: 0,
    favorite: false,
    material: "Denim",
    storageLocation: "Closet · Pants Hanger",
    careInstructions: "Wash inside out with cold water · line dry",
    sentimentalValue: "Low",
    cost: "$70",
    status: "clean",
  },
  {
    id: 14,
    name: "Light blue button-up shirt",
    category: "Tops",
    color: "#A9D7F2",
    colorName: "Light Blue",
    imageData: "/wardrobe/light-blue-button-up-shirt.png",
    worn: 0,
    favorite: false,
    material: "Cotton blend",
    storageLocation: "Closet · Shirt Rack",
    careInstructions: "Machine wash cold · hang dry",
    sentimentalValue: "Low",
    cost: "$35",
    status: "clean",
  },
]

export function generateRecentLooks(): RecentLook[] {
  const getOffsetDay = (daysAgo: number) => {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    return d.toLocaleDateString("en-US", { weekday: "long" })
  }
  return [
    {
      id: "look-1",
      day: getOffsetDay(1),
      date: "Yesterday",
      color: THEME_COLORS.darkTeal,
      items: ["Teal trench", "Black wide-legs", "White sneakers"],
      direction: "Stylish",
      occasion: "Campus & meetings",
    },
    {
      id: "look-2",
      day: getOffsetDay(2),
      date: "2 days ago",
      color: THEME_COLORS.pink,
      items: ["Magenta blouse", "Camel trousers", "Tan loafers"],
      direction: "Stylish",
      occasion: "Project presentation",
    },
    {
      id: "look-3",
      day: getOffsetDay(3),
      date: "3 days ago",
      color: "#2B4B8C",
      items: ["Navy tee", "Slim jeans", "White sneakers"],
      direction: "Safe",
      occasion: "Casual study day",
    },
    {
      id: "look-4",
      day: getOffsetDay(4),
      date: "4 days ago",
      color: "#C8965A",
      items: ["Cream blouse", "Camel trousers", "Tan loafers"],
      direction: "Rediscover",
      occasion: "Family brunch",
    },
    {
      id: "look-5",
      day: getOffsetDay(5),
      date: "5 days ago",
      color: THEME_COLORS.lightGreen,
      items: ["Mint mock-neck", "Black wide-legs", "Platforms"],
      direction: "Rediscover",
      occasion: "Art gallery visit",
    },
    {
      id: "look-6",
      day: getOffsetDay(6),
      date: "6 days ago",
      color: THEME_COLORS.gold,
      items: ["Gold hoops", "Slim jeans", "Navy tee"],
      direction: "Safe",
      occasion: "Dinner with friends",
    },
  ]
}

export const INITIAL_RECENT_LOOKS: RecentLook[] = generateRecentLooks()

export const PERSONA_WEATHER: Record<PersonaId, WeatherData> = {
  eliora: {
    city: "Hammond, LA",
    temp: "58°F",
    condition: "Breezy & Cool · 58°F",
    advice: "Crisp autumn air. Layering your favorite soft knit or jacket keeps you warm and sensory-comfortable.",
    icon: "⛅",
  },
  ethan: {
    city: "Hammond, LA",
    temp: "64°F",
    condition: "Clear & Breezy · 64°F",
    advice: "Crisp urban breeze. Structured blazer or jacket recommended for evening networking.",
    icon: "🏙️",
  },
  jordan: {
    city: "Hammond, LA",
    temp: "72°F",
    condition: "Sunny & Mild · 72°F",
    advice: "Warm sunny afternoon. Breathable cotton layers prevent morning-to-afternoon decision fatigue.",
    icon: "☀️",
  },
  josephine: {
    city: "Hammond, LA",
    temp: "70°F",
    condition: "Pleasant & Clear · 70°F",
    advice: "Soft natural fibers and breathable textures keep you comfortable throughout the day.",
    icon: "🌤️",
  },
  areeba: {
    city: "Hammond, LA",
    temp: "75°F",
    condition: "Humid Subtropical · 75°F",
    advice: "Warm subtropical air. Light dynamic layers with statement accessories shine today.",
    icon: "✨",
  },
}

export interface AddCustomStyleInput {
  label: string
  tagline: string
  accent: string
  items: OutfitItem[]
  rationale?: string
  whyDetails?: {
    weatherReason: string
    colorHarmony: string
    wearFrequency: string
    sensoryComfort: string
  }
}

export const DEFAULT_DIRECTION_FOR_PERSONA: Record<PersonaId, string> = {
  eliora: "pastel_goth",
  ethan: "business_casual",
  jordan: "zero_fatigue",
  josephine: "high_contrast",
  areeba: "creative_chic",
}

export function getStoredCustomStyles(personaId: string): Record<string, Outfit> {
  try {
    const raw = localStorage.getItem(`tailor_custom_styles_${personaId}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

export function saveStoredCustomStyles(personaId: string, customStyles: Record<string, Outfit>) {
  try {
    localStorage.setItem(`tailor_custom_styles_${personaId}`, JSON.stringify(customStyles))
  } catch {}
}

export function getOutfitsForUser(personaId: PersonaId): Record<Direction, Outfit> {
  const base = PERSONA_OUTFITS[personaId] || PERSONA_OUTFITS.eliora
  const customs = getStoredCustomStyles(personaId)
  return { ...base, ...customs }
}

export const PERSONA_OUTFITS: Record<PersonaId, Record<Direction, Outfit>> = {
  eliora: {
    pastel_goth: {
      direction: "pastel_goth",
      label: "Pastel Goth",
      tagline: "Pastel pink · deep contrast",
      rationale:
        "Dusty pastel pink blouse contrasted against fluid midnight black trousers — your signature pastel goth look.",
      accent: "var(--pink)",
      bg: "rgba(226,130,143,0.08)",
      items: [
        {
          type: "Top",
          desc: "Pastel pink tailored blouse",
          color: THEME_COLORS.rose,
          emoji: "👚",
          reason: "Soft pastel pink focal point with delicate drape.",
        },
        {
          type: "Bottom",
          desc: "Black wide-leg trousers",
          color: "#1A1A2E",
          emoji: "👖",
          reason: "Onyx black base anchors the vibrant pastel hue.",
        },
        {
          type: "Shoes",
          desc: "Chunky platform sneakers",
          color: "#E8E8E8",
          emoji: "👟",
          reason: "Elevated platform silhouette completing the pastel goth contrast.",
        },
      ],
      whyDetails: {
        weatherReason: "Lightweight layer pairs smoothly with cool 58°F indoor/outdoor temperatures.",
        colorHarmony: "Iconic pastel goth pairing: soft dusty pink against midnight black.",
        wearFrequency: "Blouse worn 6 times; fresh in current cycle.",
        sensoryComfort: "Smooth lined viscose without scratchy tags.",
      },
    },
    sensory_soft: {
      direction: "sensory_soft",
      label: "Sensory Soft",
      tagline: "Comfort-first · tagless cotton",
      rationale:
        "Ultra-soft tagless cotton scoop tee with fluid crepe trousers. Dark pastel goth staples with zero texture friction.",
      accent: "var(--pink)",
      bg: "rgba(206,0,90,0.08)",
      items: [
        {
          type: "Top",
          desc: "Burgundy soft scoop tee",
          color: "#6A1A32",
          emoji: "👕",
          reason: "Ultra-soft tagless cotton with zero friction.",
        },
        {
          type: "Bottom",
          desc: "Black wide-leg trousers",
          color: "#1A1A2E",
          emoji: "👖",
          reason: "Fluid crepe with non-restrictive elastic waist.",
        },
        {
          type: "Shoes",
          desc: "Chunky platform sneakers",
          color: "#E8E8E8",
          emoji: "👟",
          reason: "Cushioned memory foam base for long campus hours.",
        },
      ],
      whyDetails: {
        weatherReason: "Ideal for 58°F cool weather; cozy cotton keeps you insulated.",
        colorHarmony: "Deep burgundy grounded with midnight black for an effortless pastel goth foundation.",
        wearFrequency: "High rotation comfort favorite.",
        sensoryComfort: "Seamless neckline, soft drape, sensory-soothing fabric.",
      },
    },
    campus_casual: {
      direction: "campus_casual",
      label: "Campus Casual",
      tagline: "Relaxed study fit · all-day ease",
      rationale:
        "Effortless breathable layers with relaxed denim, optimized for long university hours and studio movement.",
      accent: "var(--turquoise)",
      bg: "rgba(105,213,230,0.08)",
      items: [
        {
          type: "Top",
          desc: "Crisp white cotton tee",
          color: "#FFFFFF",
          emoji: "👕",
          reason: "Breathable natural cotton for campus lectures.",
        },
        {
          type: "Bottom",
          desc: "Slim medium jeans",
          color: "#4A6FA5",
          emoji: "👖",
          reason: "Flexible stretch denim for walking across campus.",
        },
        {
          type: "Shoes",
          desc: "Chunky platform sneakers",
          color: "#E8E8E8",
          emoji: "👟",
          reason: "Comfortable platforms built for heavy steps between classes.",
        },
      ],
      whyDetails: {
        weatherReason: "Optimal for breezy 58°F campus commutes.",
        colorHarmony: "Crisp white tee with medium indigo denim — effortless and clean.",
        wearFrequency: "Staple weekly university rotation.",
        sensoryComfort: "Lightweight breathable cotton with flat seams.",
      },
    },
    color_splash: {
      direction: "color_splash",
      label: "Color Splash",
      tagline: "Mint pastel pop · unexpected touch",
      rationale:
        "Your mint mock-neck knit brings a vibrant pastel pop grounded by fluid midnight black trousers.",
      accent: "var(--light-green)",
      bg: "rgba(118,224,154,0.08)",
      items: [
        {
          type: "Top",
          desc: "Mint ribbed mock-neck",
          color: THEME_COLORS.lightGreen,
          emoji: "🧶",
          reason: "Brings an unworn pastel gem back into rotation.",
        },
        {
          type: "Bottom",
          desc: "Black wide-leg trousers",
          color: "#1A1A2E",
          emoji: "👖",
          reason: "Deep black trousers balance the fresh mint knit.",
        },
        {
          type: "Shoes",
          desc: "Chunky platform sneakers",
          color: "#E8E8E8",
          emoji: "👟",
          reason: "Adds modern height and grounded street style.",
        },
      ],
      whyDetails: {
        weatherReason: "Cozy knit mock-neck provides warmth for 58°F breezes.",
        colorHarmony: "Mint pastel highlights against rich charcoal-black neutrals.",
        wearFrequency: "Unworn in 21 days — breaks closet monotony.",
        sensoryComfort: "Soft ribbed cotton knit with flexible collar.",
      },
    },
  },
  ethan: {
    business_casual: {
      direction: "business_casual",
      label: "Business Casual",
      tagline: "Classic tailored Oxford · zero morning stress",
      rationale:
        "Impeccably tailored classic business-casual for high-confidence office presentations.",
      accent: "var(--turquoise)",
      bg: "rgba(105,213,230,0.08)",
      items: [
        {
          type: "Top",
          desc: "Crisp white Oxford shirt",
          color: "#F2F2F2",
          emoji: "👔",
          reason: "Structured, breathable cotton button-down.",
        },
        {
          type: "Bottom",
          desc: "Navy tailored chinos",
          color: "#2B4B8C",
          emoji: "👖",
          reason: "Clean professional lines with all-day comfort.",
        },
        {
          type: "Shoes",
          desc: "Tan leather loafers",
          color: "#B8825A",
          emoji: "👞",
          reason: "Polished cognac leather for professional impressions.",
        },
      ],
      whyDetails: {
        weatherReason: "Breathable weave calibrated for 64°F brisk morning commutes.",
        colorHarmony: "Classic navy and crisp white contrast with warm cognac leather.",
        wearFrequency: "Trusted signature networking staple.",
        sensoryComfort: "Structured silhouette with light stretch.",
      },
    },
    client_dinner: {
      direction: "client_dinner",
      label: "Client Dinner",
      tagline: "Sharp executive presence · networking ready",
      rationale:
        "Complementary navy structured knit blazer and warm camel trousers engineered for networking dinners.",
      accent: "var(--dark-teal)",
      bg: "rgba(0,120,128,0.08)",
      items: [
        {
          type: "Top",
          desc: "Navy structured knit blazer",
          color: "#1B2A4A",
          emoji: "🧥",
          reason: "Adds authoritative executive presence.",
        },
        {
          type: "Bottom",
          desc: "Camel wide trousers",
          color: "#C8965A",
          emoji: "👖",
          reason: "Warm camel breaks monotony while staying sharp.",
        },
        {
          type: "Shoes",
          desc: "Tan leather loafers",
          color: "#B8825A",
          emoji: "👞",
          reason: "Brings refined structure without being rigid.",
        },
      ],
      whyDetails: {
        weatherReason: "Wool-blend blazer provides light thermal shield for breezy 64°F evenings.",
        colorHarmony: "Navy & warm camel complementary executive palette.",
        wearFrequency: "Blazer logged 4 times — prime for dinner events.",
        sensoryComfort: "Full interior lining eliminates friction.",
      },
    },
    casual_friday: {
      direction: "casual_friday",
      label: "Casual Friday",
      tagline: "Smart denim · polished comfort",
      rationale:
        "Airy linen blouse paired with slim medium denim and clean white leather sneakers for relaxed office days.",
      accent: "var(--gold)",
      bg: "rgba(255,203,68,0.08)",
      items: [
        {
          type: "Top",
          desc: "Cream linen blouse",
          color: "#F5EFD8",
          emoji: "👔",
          reason: "Airy flax linen rediscovery with sharp collar.",
        },
        {
          type: "Bottom",
          desc: "Slim medium jeans",
          color: "#4A6FA5",
          emoji: "👖",
          reason: "Smart tailored denim for casual Fridays.",
        },
        {
          type: "Shoes",
          desc: "White leather sneakers",
          color: "#F2F2F2",
          emoji: "👟",
          reason: "Pristine leather sneakers balance smart-casual.",
        },
      ],
      whyDetails: {
        weatherReason: "Light linen breathes easily in 64°F weather.",
        colorHarmony: "Soft cream and medium denim with white accents.",
        wearFrequency: "Cream blouse unworn for 2 weeks.",
        sensoryComfort: "Relaxed linen texture softens with wear.",
      },
    },
    smart_trench: {
      direction: "smart_trench",
      label: "Smart Trench",
      tagline: "Structured layer · urban commute",
      rationale:
        "Sleek teal trench coat layered over navy chinos for sudden weather changes and sharp transit.",
      accent: "var(--red)",
      bg: "rgba(218,64,12,0.08)",
      items: [
        {
          type: "Top",
          desc: "Teal trench coat",
          color: THEME_COLORS.darkTeal,
          emoji: "🧥",
          reason: "Water-resistant outerwear with sharp silhouette.",
        },
        {
          type: "Bottom",
          desc: "Navy tailored chinos",
          color: "#2B4B8C",
          emoji: "👖",
          reason: "Slim tailored chinos resistant to city grime.",
        },
        {
          type: "Shoes",
          desc: "Tan leather loafers",
          color: "#B8825A",
          emoji: "👞",
          reason: "Polished loafers finishing the sharp commuter silhouette.",
        },
      ],
      whyDetails: {
        weatherReason: "Gabardine fabric resists sudden 64°F evening wind and light rain.",
        colorHarmony: "Deep teal statement layer with classic navy trousers.",
        wearFrequency: "Seasonal commuter staple.",
        sensoryComfort: "Roomy cut fits easily over collared shirts.",
      },
    },
  },
  jordan: {
    zero_fatigue: {
      direction: "zero_fatigue",
      label: "Zero Fatigue",
      tagline: "1-second choice · reliable favorites",
      rationale:
        "Zero morning stress: your most-worn, familiar comfort staples with proven fit and zero friction.",
      accent: "var(--turquoise)",
      bg: "rgba(105,213,230,0.08)",
      items: [
        {
          type: "Top",
          desc: "Navy relaxed crew tee",
          color: "#2B4B8C",
          emoji: "👕",
          reason: "Reliable, breathable Pima cotton base.",
        },
        {
          type: "Bottom",
          desc: "Slim medium jeans",
          color: "#4A6FA5",
          emoji: "👖",
          reason: "Easy stretch structure for all-day wear.",
        },
        {
          type: "Shoes",
          desc: "White leather sneakers",
          color: "#F2F2F2",
          emoji: "👟",
          reason: "Maximum cushioning for time on your feet.",
        },
      ],
      whyDetails: {
        weatherReason: "Optimal for 72°F sunny weather; breathable layers prevent overheating.",
        colorHarmony: "Tonal Navy & Medium Indigo blue create a calming monochromatic foundation.",
        wearFrequency: "Your signature comfort staple — high confidence rating.",
        sensoryComfort: "Tagless crew neck, zero friction on neck and waist.",
      },
    },
    closet_rediscovery: {
      direction: "closet_rediscovery",
      label: "Closet Rediscovery",
      tagline: "Unworn gem · 21 days since last wear",
      rationale:
        "Your mint mock-neck knit hasn't been logged in 21 days! Paired with midnight black trousers to refresh your rotation.",
      accent: "var(--green)",
      bg: "rgba(64,176,102,0.08)",
      items: [
        {
          type: "Top",
          desc: "Mint ribbed mock-neck",
          color: THEME_COLORS.lightGreen,
          emoji: "🧶",
          reason: "Brings an unworn gem back into rotation.",
        },
        {
          type: "Bottom",
          desc: "Black wide-leg trousers",
          color: "#1A1A2E",
          emoji: "👖",
          reason: "Keeps the light mint knit visually anchored.",
        },
        {
          type: "Shoes",
          desc: "White leather sneakers",
          color: "#F2F2F2",
          emoji: "👟",
          reason: "Clean white sneaker balances dark trousers.",
        },
      ],
      whyDetails: {
        weatherReason: "Comfortable for 72°F mild afternoon.",
        colorHarmony: "Soft pastel green contrasted with dark navy-black.",
        wearFrequency: "Unworn for 21 days.",
        sensoryComfort: "Soft ribbed cotton.",
      },
    },
    earth_tones: {
      direction: "earth_tones",
      label: "Earth Tones",
      tagline: "Warm neutral drape · minimalist calm",
      rationale:
        "Organic linen in warm cream paired with camel trousers for grounded, minimalist daily calm.",
      accent: "var(--red)",
      bg: "rgba(218,64,12,0.08)",
      items: [
        {
          type: "Top",
          desc: "Cream linen blouse",
          color: "#F5EFD8",
          emoji: "👚",
          reason: "Natural flax linen with organic drape.",
        },
        {
          type: "Bottom",
          desc: "Camel wide trousers",
          color: "#C8965A",
          emoji: "👖",
          reason: "Earthy camel tone anchors the lightweight top.",
        },
        {
          type: "Shoes",
          desc: "Tan leather loafers",
          color: "#B8825A",
          emoji: "👞",
          reason: "Warm cognac matches earthy palette.",
        },
      ],
      whyDetails: {
        weatherReason: "Airy linen keeps you cool in warm 72°F sunshine.",
        colorHarmony: "Monochromatic warm neutrals: off-white and camel.",
        wearFrequency: "Balanced rotation.",
        sensoryComfort: "Loose fit avoids waist pressure.",
      },
    },
    quick_errand: {
      direction: "quick_errand",
      label: "Quick Errand",
      tagline: "Easy weekend run · effortless slip-on",
      rationale:
        "Crisp white tee, comfortable stretch jeans, and cushioned sneakers for quick errands and weekend coffee.",
      accent: "var(--gold)",
      bg: "rgba(255,203,68,0.08)",
      items: [
        {
          type: "Top",
          desc: "Crisp white cotton tee",
          color: "#FFFFFF",
          emoji: "👕",
          reason: "Clean staple cotton tee ready in 1 second.",
        },
        {
          type: "Bottom",
          desc: "Slim medium jeans",
          color: "#4A6FA5",
          emoji: "👖",
          reason: "Comfortable broken-in denim.",
        },
        {
          type: "Shoes",
          desc: "White leather sneakers",
          color: "#F2F2F2",
          emoji: "👟",
          reason: "Slip-on cushioned ease for grocery runs.",
        },
      ],
      whyDetails: {
        weatherReason: "Lightweight for warm 72°F midday running around.",
        colorHarmony: "Crisp white and timeless indigo blue.",
        wearFrequency: "Effortless weekend uniform.",
        sensoryComfort: "Zero restrictions, zero dressing hesitation.",
      },
    },
  },
  josephine: {
    high_contrast: {
      direction: "high_contrast",
      label: "High Contrast",
      tagline: "15:1 visual ratio · crisp boundaries",
      rationale:
        "Maximum visual contrast with soft tactile seams to eliminate dressing hesitation and visual strain.",
      accent: "var(--gold)",
      bg: "rgba(255,203,68,0.08)",
      items: [
        {
          type: "Top",
          desc: "Crisp white cotton tee",
          color: "#FFFFFF",
          emoji: "👕",
          reason: "Crisp stark white for immediate visual clarity.",
        },
        {
          type: "Bottom",
          desc: "Black wide-leg trousers",
          color: "#1A1A2E",
          emoji: "👖",
          reason: "Deep midnight black provides 15:1 WCAG contrast ratio.",
        },
        {
          type: "Shoes",
          desc: "White leather sneakers",
          color: "#F2F2F2",
          emoji: "👟",
          reason: "High-contrast white shoes make orientation easy.",
        },
      ],
      whyDetails: {
        weatherReason: "Comfortable for 70°F mild temperatures.",
        colorHarmony: "Maximum black and white contrast for visual impairment ease.",
        wearFrequency: "Staple daily high-contrast uniform.",
        sensoryComfort: "Tagless, flat seams, tactile natural cotton.",
      },
    },
    tactile_natural: {
      direction: "tactile_natural",
      label: "Tactile Natural",
      tagline: "Ribbed knit · instant touch recognition",
      rationale:
        "Rediscover your tactile ribbed knit — instantly recognizable by touch with distinct high-contrast borders.",
      accent: "var(--light-green)",
      bg: "rgba(118,224,154,0.08)",
      items: [
        {
          type: "Top",
          desc: "Mint ribbed mock-neck",
          color: THEME_COLORS.lightGreen,
          emoji: "🧶",
          reason: "Unique ribbed texture gives instant tactile recognition.",
        },
        {
          type: "Bottom",
          desc: "Black wide-leg trousers",
          color: "#1A1A2E",
          emoji: "👖",
          reason: "Deep black background makes mint ribbing pop visually and by touch.",
        },
        {
          type: "Shoes",
          desc: "White leather sneakers",
          color: "#F2F2F2",
          emoji: "👟",
          reason: "Crisp white finish with textured leather.",
        },
      ],
      whyDetails: {
        weatherReason: "Cozy knit for 70°F indoor/outdoor comfort.",
        colorHarmony: "Light mint against midnight black creates sharp visual edges.",
        wearFrequency: "Rediscovered unworn piece.",
        sensoryComfort: "Gentle mock collar without choking sensation.",
      },
    },
    bold_block: {
      direction: "bold_block",
      label: "Bold Block",
      tagline: "Clear color boundaries · distinct tiers",
      rationale:
        "Rich cobalt blue contrasted with warm camel trousers for clear visual segmentation and tactile comfort.",
      accent: "var(--turquoise)",
      bg: "rgba(105,213,230,0.08)",
      items: [
        {
          type: "Top",
          desc: "Navy relaxed crew tee",
          color: "#2B4B8C",
          emoji: "👕",
          reason: "Distinct rich cobalt blue with tactile label.",
        },
        {
          type: "Bottom",
          desc: "Camel wide trousers",
          color: "#C8965A",
          emoji: "👖",
          reason: "Warm camel contrast with distinct ribbed waistband.",
        },
        {
          type: "Shoes",
          desc: "White leather sneakers",
          color: "#F2F2F2",
          emoji: "👟",
          reason: "Light footwear completes the 3-tier value contrast.",
        },
      ],
      whyDetails: {
        weatherReason: "Comfortable breathable cotton for 70°F.",
        colorHarmony: "High value distinction between deep navy and warm camel.",
        wearFrequency: "Balanced rotation.",
        sensoryComfort: "Embroidered tactile care labels.",
      },
    },
    gentle_bamboo: {
      direction: "gentle_bamboo",
      label: "Gentle Bamboo",
      tagline: "Sensory-soothing · zero tags",
      rationale:
        "Ultra-soft tagless scoop tee in deep burgundy with non-restrictive elastic waist trousers for gentle daily wear.",
      accent: "var(--pink)",
      bg: "rgba(206,0,90,0.08)",
      items: [
        {
          type: "Top",
          desc: "Burgundy soft scoop tee",
          color: "#6A1A32",
          emoji: "👕",
          reason: "Sensory-soothing tagless neckline.",
        },
        {
          type: "Bottom",
          desc: "Black wide-leg trousers",
          color: "#1A1A2E",
          emoji: "👖",
          reason: "Gentle elastic waist with high-contrast tactile seam.",
        },
        {
          type: "Shoes",
          desc: "White leather sneakers",
          color: "#F2F2F2",
          emoji: "👟",
          reason: "Cushioned memory foam support.",
        },
      ],
      whyDetails: {
        weatherReason: "Breathable cotton optimal for 70°F.",
        colorHarmony: "Deep jewel burgundy against black trousers.",
        wearFrequency: "High comfort everyday uniform.",
        sensoryComfort: "100% flat seams, zero scratchy labels.",
      },
    },
  },
  areeba: {
    creative_chic: {
      direction: "creative_chic",
      label: "Creative Chic",
      tagline: "Linen drape · gold statement",
      rationale:
        "Effortless creative chic grounded by relaxed denim and warm gold accents for design syncs.",
      accent: "var(--gold)",
      bg: "rgba(255,203,68,0.08)",
      items: [
        {
          type: "Top",
          desc: "Cream linen blouse",
          color: "#F5EFD8",
          emoji: "👚",
          reason: "Linen drape that pairs effortlessly with gold jewelry.",
        },
        {
          type: "Bottom",
          desc: "Slim medium jeans",
          color: "#4A6FA5",
          emoji: "👖",
          reason: "Classic denim foundation for dynamic statement tops.",
        },
        {
          type: "Shoes",
          desc: "White leather sneakers",
          color: "#F2F2F2",
          emoji: "👟",
          reason: "Pristine white sneakers with subtle metallic accents.",
        },
      ],
      whyDetails: {
        weatherReason: "Breathable linen matches 75°F humid subtropical warmth.",
        colorHarmony: "Warm cream, indigo denim, and golden warmth.",
        wearFrequency: "Go-to creative meeting ensemble.",
        sensoryComfort: "Lightweight natural weave.",
      },
    },
    team_lead_polish: {
      direction: "team_lead_polish",
      label: "Team Lead Polish",
      tagline: "Statement trench · executive chic",
      rationale:
        "Statement teal trench with warm camel trousers — bold, polished, and commanding for capstone presentations.",
      accent: "var(--red)",
      bg: "rgba(218,64,12,0.08)",
      items: [
        {
          type: "Top",
          desc: "Teal trench coat",
          color: THEME_COLORS.darkTeal,
          emoji: "🧥",
          reason: "Dramatic focal layer with creative flair and Snoopy pin.",
        },
        {
          type: "Bottom",
          desc: "Camel wide trousers",
          color: "#C8965A",
          emoji: "👖",
          reason: "Sophisticated warm camel contrasts with bold teal.",
        },
        {
          type: "Shoes",
          desc: "Tan leather loafers",
          color: "#B8825A",
          emoji: "👞",
          reason: "Structured cognac loafers complete the elevated look.",
        },
      ],
      whyDetails: {
        weatherReason: "Drapey trench shields from sudden subtropical coastal showers.",
        colorHarmony: "Complementary teal and camel — vivid, authoritative, and chic.",
        wearFrequency: "Showcase outfit for capstone and team lead presentations.",
        sensoryComfort: "Fluid motion with comfortable wide trousers.",
      },
    },
    gold_statement: {
      direction: "gold_statement",
      label: "Gold Statement",
      tagline: "Vivid magenta · bold accents",
      rationale:
        "Vivid magenta button-down paired with tailored camel trousers and gold hoops for striking presentation energy.",
      accent: "var(--pink)",
      bg: "rgba(206,0,90,0.08)",
      items: [
        {
          type: "Top",
          desc: "Magenta button-down",
          color: THEME_COLORS.pink,
          emoji: "👚",
          reason: "Vivid magenta statement top with radiant sheen.",
        },
        {
          type: "Bottom",
          desc: "Camel wide trousers",
          color: "#C8965A",
          emoji: "👖",
          reason: "Rich camel base creating a striking color block.",
        },
        {
          type: "Shoes",
          desc: "Tan leather loafers",
          color: "#B8825A",
          emoji: "👞",
          reason: "Cognac leather anchoring warm gold accessories.",
        },
      ],
      whyDetails: {
        weatherReason: "Breathable rayon allows easy movement in 75°F humidity.",
        colorHarmony: "Bold magenta against camel trousers elevated by gold jewelry.",
        wearFrequency: "Signature power styling.",
        sensoryComfort: "Light fluid rayon drape.",
      },
    },
    playful_pop: {
      direction: "playful_pop",
      label: "Playful Pop",
      tagline: "Pastel mock-neck · street silhouette",
      rationale:
        "Fresh mint knit with midnight black trousers and chunky platforms for an unexpected playful spin.",
      accent: "var(--turquoise)",
      bg: "rgba(105,213,230,0.08)",
      items: [
        {
          type: "Top",
          desc: "Mint ribbed mock-neck",
          color: THEME_COLORS.lightGreen,
          emoji: "🧶",
          reason: "Fresh mint knit brings playful energy back.",
        },
        {
          type: "Bottom",
          desc: "Black wide-leg trousers",
          color: "#1A1A2E",
          emoji: "👖",
          reason: "Onyx black grounds the creative pastel.",
        },
        {
          type: "Shoes",
          desc: "Chunky platform sneakers",
          color: "#E8E8E8",
          emoji: "👟",
          reason: "Platform sneakers complete the modern street silhouette.",
        },
      ],
      whyDetails: {
        weatherReason: "Breathable knit suitable for 75°F air-conditioned studios.",
        colorHarmony: "Playful mint pastel on deep midnight black.",
        wearFrequency: "Reviving unworn wardrobe favorite.",
        sensoryComfort: "Soft ribbed cotton.",
      },
    },
  },
}

export type ThemeMode = "light" | "dark"

export interface AppContextType {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  user: UserProfile
  isAuthenticated: boolean
  login: (user?: UserProfile) => void
  logout: () => void
  switchUser: (personaId: PersonaId) => void
  updateAccessibility: (
    key: keyof UserProfile["accessibility"],
    val: boolean,
  ) => void
  applyQuizResult: (result: QuizResult) => void
  wardrobe: WardrobeItem[]
  addWardrobeItem: (item: Omit<WardrobeItem, "id">) => WardrobeItem
  updateWardrobeItem: (item: WardrobeItem) => void
  deleteWardrobeItem: (id: number) => void
  toggleFavorite: (id: number) => void
  markItemWorn: (id: number) => void
  recentLooks: RecentLook[]
  logOutfitWorn: (outfit: {
    label: string
    items: string[]
    color: string
    direction: string
  }) => void
  sendOutfitToLaundry: (itemNames: string[]) => void
  notifications: AppNotification[]
  showToast: (
    title: string,
    message: string,
    type?: "info" | "success" | "warning",
  ) => void
  dismissToast: (id: string) => void

  // Stylist & Outfit state in AppContext
  outfits: Record<Direction, Outfit>
  selectedDirection: Direction
  setSelectedDirection: (dir: Direction) => void
  defaultDirection: string
  addCustomStyle: (input: AddCustomStyleInput) => void
  removeCustomStyle: (directionKey: string) => void
  currentOutfit: Outfit
  wornToday: boolean
  setWornToday: (val: boolean) => void
  regenerateOutfit: (reasonConstraint?: string) => void
  swapOutfitItem: (index: number, replacementItem: WardrobeItem) => void
  undoOutfit: () => boolean
  hasUndo: boolean

  // Weather state in AppContext
  weather: WeatherData
  refreshWeather: () => void

  // User testing script state: stylist tab first-run network error
  stylistNetworkErrorTriggered: boolean
  setStylistNetworkErrorTriggered: (val: boolean) => void

  // Accessible font scaling & font options
  fontScale: FontScale
  setFontScale: (scale: FontScale) => void
  accessibleFont: AccessibleFont
  setAccessibleFont: (font: AccessibleFont) => void

  // Outfit favorites & cross-tab Try-On navigation
  favoriteOutfitIds: string[]
  favoriteOutfits: FavoriteOutfit[]
  toggleFavoriteOutfit: (outfitId: string, outfitPayload?: FavoriteOutfit) => void
  saveFavoriteOutfit: (outfit: FavoriteOutfit) => void
  removeFavoriteOutfit: (id: string) => void
  activeTryOnOutfit: FavoriteOutfit | null
  setActiveTryOnOutfit: (outfit: FavoriteOutfit | null) => void
  requestedTab: ("home" | "wardrobe" | "generator" | "laundry" | "tryon" | "profile") | null
  setRequestedTab: (
    tab: ("home" | "wardrobe" | "generator" | "laundry" | "tryon" | "profile") | null,
  ) => void

  // Feedback notes
  outfitFeedbackNotes: Record<string, { notes: string; reasons?: string[]; timestamp: string }>
  saveOutfitFeedback: (outfitId: string, notes: string, reasons?: string[]) => void
  garmentFeedbackNotes: Record<string, { notes: string; reasons?: string[]; timestamp: string }>
  saveGarmentFeedback: (itemId: string, notes: string, reasons?: string[]) => void
}

function hydrateFavoriteOutfits(
  favs: FavoriteOutfit[],
  wardrobeItems: WardrobeItem[],
): FavoriteOutfit[] {
  return favs.map((fav) => ({
    ...fav,
    items: fav.items.map((item) => {
      const matched =
        wardrobeItems.find((w) => w.id === item.wardrobeItemId) ||
        wardrobeItems.find(
          (w) => w.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
        )
      const isRemoteSeed =
        (item.wardrobeItemId === 13 || item.wardrobeItemId === 14) &&
        typeof item.imageData === "string" &&
        item.imageData.startsWith("http")
      const resolvedImage =
        (!isRemoteSeed && item.imageData) ||
        matched?.imageData ||
        getSampleGarmentImage(item.name, item.type)
      return resolvedImage && resolvedImage !== item.imageData
        ? { ...item, imageData: resolvedImage }
        : item
    }),
  }))
}

function buildDefaultFavoriteOutfits(
  wardrobeItems: WardrobeItem[],
  personaId?: PersonaId,
): FavoriteOutfit[] {
  const outfits: FavoriteOutfit[] = []
  const toFavItem = (
    w: WardrobeItem,
    slotOverride?: string,
  ): FavoriteOutfitItem => ({
    type:
      slotOverride ||
      (w.category === "Accessories"
        ? "Accessory"
        : w.category === "Outerwear"
          ? "Outerwear"
          : w.category.slice(0, -1)),
    name: w.name,
    color: w.color,
    emoji:
      w.category === "Outerwear"
        ? "🧥"
        : w.category === "Bottoms"
          ? "👖"
          : w.category === "Shoes"
            ? "👟"
            : w.category === "Accessories"
              ? "💍"
              : "👕",
    imageData: w.imageData || getSampleGarmentImage(w.name, w.category),
    wardrobeItemId: w.id,
  })

  const makeLook = (
    id: string,
    label: string,
    tagline: string,
    itemNames: string[],
  ) => {
    const matched = itemNames
      .map((n) =>
        wardrobeItems.find(
          (w) => w.name.trim().toLowerCase() === n.trim().toLowerCase(),
        ),
      )
      .filter(Boolean) as WardrobeItem[]
    if (matched.length < 2) return
    outfits.push({
      id,
      label,
      tagline,
      colors: matched.slice(0, 3).map((m) => m.color),
      items: matched.map((m) => toFavItem(m)),
      createdAt: "Seeded favorite",
    })
  }

  const pid = personaId || "eliora"
  if (pid === "eliora") {
    makeLook("fav-eliora-pastel", "Pastel Goth Signature", "Dusty rose blouse · midnight wide-legs", [
      "Pastel pink tailored blouse",
      "Black wide-leg trousers",
      "Black lug-sole Mary Janes",
    ])
    makeLook("fav-eliora-soft", "Sensory Soft Studio", "Seamless burgundy tee · platform sneakers", [
      "Burgundy soft scoop tee",
      "Black wide-leg trousers",
      "Chunky platform sneakers",
    ])
  } else if (pid === "ethan") {
    makeLook("fav-ethan-dinner", "Executive Client Dinner", "Navy knit blazer · warm camel trousers", [
      "Sky blue pinpoint dress shirt",
      "Navy structured knit blazer",
      "Camel wide trousers",
      "Tan leather loafers",
    ])
    makeLook("fav-ethan-office", "Business Casual Oxford", "Crisp white Oxford · tailored navy chinos", [
      "Crisp white Oxford shirt",
      "Navy tailored chinos",
      "Tan leather loafers",
    ])
  } else if (pid === "jordan") {
    makeLook("fav-jordan-earth", "Earth Tone Calm", "Oatmeal overshirt · forest olive chinos", [
      "Oatmeal linen overshirt",
      "Olive relaxed chinos",
      "Tan suede desert boots",
    ])
    makeLook("fav-jordan-zero", "Zero-Fatigue Daily", "Navy Pima tee · slim indigo jeans", [
      "Navy relaxed crew tee",
      "Slim medium jeans",
      "White leather sneakers",
    ])
  } else if (pid === "josephine") {
    makeLook("fav-josephine-contrast", "High-Contrast 15:1 Look", "Stark white tee · onyx wide-leg trousers", [
      "Crisp white cotton tee",
      "Black wide-leg trousers",
      "White leather sneakers",
    ])
    makeLook("fav-josephine-gold", "Warm Gold & Burgundy", "Soft scoop tee · bamboo-knit cardigan", [
      "Burgundy soft scoop tee",
      "Soft bamboo-knit cardigan",
      "Black wide-leg trousers",
      "Black cushioned ballet loafers",
    ])
  } else if (pid === "areeba") {
    makeLook("fav-areeba-lead", "Team Lead Statement", "Deep teal trench · warm camel trousers", [
      "Cream linen blouse",
      "Teal trench coat",
      "Camel wide trousers",
      "Tan leather loafers",
    ])
    makeLook("fav-areeba-snoopy", "Snoopy Studio Creative", "Vintage graphic tee · tailored cream blazer", [
      "Snoopy graphic studio tee",
      "Tailored cream blazer",
      "Slim medium jeans",
      "White leather sneakers",
    ])
  }

  const top = wardrobeItems.find((item) => item.id === 14)
  const bottom = wardrobeItems.find((item) => item.id === 13)
  if (top && bottom) {
    outfits.push({
      id: "fav-blue-casual",
      label: "Light Blue Button-Up & Blue Jeans",
      tagline: "A clean, casual favorite ready for 3D posing & Virtual Try-On",
      colors: [top.color, bottom.color],
      items: [toFavItem(top, "Top"), toFavItem(bottom, "Bottom")],
      createdAt: "Seeded favorite",
    })
  }
  return outfits
}

function mapTodayOutfitToFavorite(
  outfit: Outfit,
  wardrobeItems: WardrobeItem[],
): FavoriteOutfit {
  const mappedItems: FavoriteOutfitItem[] = outfit.items.map((item) => {
    const matched = wardrobeItems.find(
      (w) => w.name.trim().toLowerCase() === item.desc.trim().toLowerCase(),
    )
    return {
      type: item.type,
      name: item.desc,
      color: item.color,
      emoji: item.emoji,
      imageData: matched?.imageData || getSampleGarmentImage(item.desc, item.type),
      wardrobeItemId: matched?.id,
    }
  })
  return {
    id: String(outfit.id || outfit.label),
    label: outfit.label,
    tagline: outfit.tagline || "Saved favorite outfit",
    colors: mappedItems.map((i) => i.color).slice(0, 3),
    items: mappedItems,
    createdAt: new Date().toISOString(),
  }
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem("tailor_theme")
      if (stored === "dark" || stored === "light") return stored
    } catch { }
    return "light"
  })

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    document.documentElement.classList.toggle("light", theme === "light")
    document.documentElement.classList.toggle("dark", theme === "dark")
    try {
      localStorage.setItem("tailor_theme", theme)
    } catch { }
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"))
  }

  // 5-step font scaling state (xs: 87.5%, sm: 100%, md: 112.5%, lg: 125%, xl: 137.5%)
  const [fontScale, setFontScaleState] = useState<FontScale>(() => {
    try {
      const saved = localStorage.getItem("tailor_font_scale") as FontScale
      if (["xs", "sm", "md", "lg", "xl"].includes(saved)) return saved
    } catch { }
    return "sm"
  })

  const setFontScale = (scale: FontScale) => {
    setFontScaleState(scale)
    setCurrentUser((prev) => ({
      ...prev,
      accessibility: {
        ...prev.accessibility,
        largeText: scale === "md" || scale === "lg" || scale === "xl",
      },
    }))
  }

  useEffect(() => {
    const root = document.documentElement
    const scaleClasses = [
      "font-scale-xs",
      "font-scale-sm",
      "font-scale-md",
      "font-scale-lg",
      "font-scale-xl",
      "font-scale-1",
      "font-scale-2",
      "font-scale-3",
      "font-scale-4",
      "font-scale-5",
    ]
    root.classList.remove(...scaleClasses)
    root.classList.add(`font-scale-${fontScale}`)
    try {
      localStorage.setItem("tailor_font_scale", fontScale)
    } catch { }
  }, [fontScale])

  // Accessible font family state
  const [accessibleFont, setAccessibleFont] = useState<AccessibleFont>(() => {
    try {
      const saved = localStorage.getItem("tailor_font_family") as AccessibleFont
      if (["nunito", "atkinson", "lexend", "opendyslexic", "system"].includes(saved)) return saved
    } catch { }
    return "nunito"
  })

  useEffect(() => {
    const root = document.documentElement
    const fontClasses = [
      "font-nunito",
      "font-atkinson",
      "font-lexend",
      "font-opendyslexic",
      "font-system",
    ]
    root.classList.remove(...fontClasses)
    root.classList.add(`font-${accessibleFont}`)
    try {
      localStorage.setItem("tailor_font_family", accessibleFont)
    } catch { }
  }, [accessibleFont])

  // Favorite outfits state
  const [favoriteOutfitIds, setFavoriteOutfitIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("tailor_favorite_outfits")
      if (saved) return JSON.parse(saved)
    } catch { }
    return []
  })

  useEffect(() => {
    try {
      localStorage.setItem("tailor_favorite_outfits", JSON.stringify(favoriteOutfitIds))
    } catch { }
  }, [favoriteOutfitIds])

  // Outfit & Garment feedback notes state
  const [outfitFeedbackNotes, setOutfitFeedbackNotes] = useState<
    Record<string, { notes: string; reasons?: string[]; timestamp: string }>
  >(() => {
    try {
      const saved = localStorage.getItem("tailor_outfit_feedback")
      if (saved) return JSON.parse(saved)
    } catch { }
    return {}
  })

  useEffect(() => {
    try {
      localStorage.setItem("tailor_outfit_feedback", JSON.stringify(outfitFeedbackNotes))
    } catch { }
  }, [outfitFeedbackNotes])

  const [garmentFeedbackNotes, setGarmentFeedbackNotes] = useState<
    Record<string, { notes: string; reasons?: string[]; timestamp: string }>
  >(() => {
    try {
      const saved = localStorage.getItem("tailor_garment_feedback")
      if (saved) return JSON.parse(saved)
    } catch { }
    return {}
  })

  useEffect(() => {
    try {
      localStorage.setItem("tailor_garment_feedback", JSON.stringify(garmentFeedbackNotes))
    } catch { }
  }, [garmentFeedbackNotes])

  // Authentication state - starts unauthenticated so the site always opens to the login page
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      localStorage.removeItem("tailor_auth")
      sessionStorage.removeItem("tailor_auth")
    } catch { }
    return false
  })

  // User testing: stylist screen first-generation error tracking per login
  const [stylistNetworkErrorTriggered, setStylistNetworkErrorTriggered] = useState<boolean>(false)

  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    try {
      const stored = localStorage.getItem("tailor_user")
      if (stored) return JSON.parse(stored)
    } catch { }
    return PRESET_PERSONAS.eliora
  })

  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>(() => {
    const pid = (currentUser.id in PERSONA_WARDROBES ? currentUser.id : "eliora") as PersonaId
    try {
      const stored = localStorage.getItem(`tailor_wardrobe_${pid}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return ensureSeededTryOnItems(parsed)
        }
      }
    } catch { }
    return getWardrobeForPersona(pid)
  })

  const [recentLooks, setRecentLooks] = useState<RecentLook[]>(() => {
    const pid = (currentUser.id in PERSONA_RECENT_LOOKS ? currentUser.id : "eliora") as PersonaId
    try {
      const stored = localStorage.getItem(`tailor_recent_looks_${pid}`)
      if (stored) return JSON.parse(stored)
    } catch { }
    return getRecentLooksForPersona(pid)
  })

  const [favoriteOutfits, setFavoriteOutfits] = useState<FavoriteOutfit[]>(() => {
    const pid = (currentUser.id in PERSONA_WARDROBES ? currentUser.id : "eliora") as PersonaId
    try {
      const stored = localStorage.getItem(`tailor_favorite_outfit_objects_${pid}`)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const hydrated = hydrateFavoriteOutfits(parsed, wardrobe)
          if (hydrated.length === 1 && hydrated[0]?.id === "fav-blue-casual") {
            const defaults = buildDefaultFavoriteOutfits(wardrobe, pid)
            const extras = defaults.filter((d) => d.id !== "fav-blue-casual")
            return [...extras, ...hydrated]
          }
          return hydrated
        }
      }
    } catch { }
    return buildDefaultFavoriteOutfits(wardrobe, pid)
  })
  const [activeTryOnOutfit, setActiveTryOnOutfit] = useState<FavoriteOutfit | null>(null)
  const [requestedTab, setRequestedTab] = useState<
    "home" | "wardrobe" | "generator" | "laundry" | "tryon" | "profile" | null
  >(null)

  useEffect(() => {
    try {
      const pid = (currentUser.id in PERSONA_WARDROBES ? currentUser.id : "eliora") as PersonaId
      localStorage.setItem(`tailor_favorite_outfit_objects_${pid}`, JSON.stringify(favoriteOutfits))
    } catch { }
  }, [favoriteOutfits, currentUser.id])

  const [notifications, setNotifications] = useState<AppNotification[]>([])

  // Stylist Outfits State managed in AppContext
  const [outfits, setOutfits] = useState<Record<Direction, Outfit>>(() => {
    return getOutfitsForUser(currentUser.id)
  })

  const [selectedDirection, setSelectedDirection] = useState<Direction>(() => {
    const initialOutfits = getOutfitsForUser(currentUser.id)
    const def =
      DEFAULT_DIRECTION_FOR_PERSONA[currentUser.id] ||
      Object.keys(initialOutfits)[0]
    return def in initialOutfits ? def : Object.keys(initialOutfits)[0]
  })

  const [outfitHistory, setOutfitHistory] = useState<Outfit[]>([])
  const [wornToday, setWornToday] = useState(false)

  // Weather & Climate State managed in AppContext (Open-Meteo live data)
  const [weather, setWeather] = useState<WeatherData>(() => {
    return PERSONA_WEATHER[currentUser.id] || PERSONA_WEATHER.eliora
  })
  const hasGpsWeatherRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    if (hasGpsWeatherRef.current) return

    void fetchLiveWeather({
      requestGeolocation: false,
      fallback: PERSONA_WEATHER[currentUser.id] || PERSONA_WEATHER.eliora,
    }).then((result) => {
      if (!cancelled && !hasGpsWeatherRef.current) {
        setWeather(result.weather)
      }
    })

    return () => {
      cancelled = true
    }
  }, [currentUser.id])

  const currentOutfit = outfits[selectedDirection] || Object.values(outfits)[0]

  const refreshWeather = async () => {
    const result = await fetchLiveWeather({
      requestGeolocation: true,
      fallback: weather,
    })
    if (result.source === "gps") {
      hasGpsWeatherRef.current = true
    }
    setWeather(result.weather)
    showToast(
      result.source === "gps"
        ? "Live Local Weather"
        : result.source === "hammond"
          ? "Live Hammond Weather"
          : "Weather Cache Active",
      `${result.weather.city}: ${result.weather.condition}`,
      result.source === "fallback" ? "warning" : "info",
    )
  }

  const regenerateOutfit = (reasonConstraint?: string) => {
    setOutfitHistory((prev) => [currentOutfit, ...prev])
    setWornToday(false)
    const alternateTops: OutfitItem[] = [
      { type: "Top", desc: "Cream linen blouse", color: "#F5EFD8", emoji: "👚", reason: "Crisp light layer with gentle drape." },
      { type: "Top", desc: "Teal trench coat", color: THEME_COLORS.darkTeal, emoji: "🧥", reason: "Polished statement top layer." },
      { type: "Top", desc: "Navy relaxed crew tee", color: "#2B4B8C", emoji: "👕", reason: "Minimalist neutral base." },
      { type: "Top", desc: "Burgundy soft scoop tee", color: "#6A1A32", emoji: "👕", reason: "Deep burgundy soft cotton staple." },
      { type: "Top", desc: "Mint ribbed mock-neck", color: THEME_COLORS.lightGreen, emoji: "🧶", reason: "Textured pastel rediscovery." },
    ]
    const randomTop = alternateTops[Math.floor(Math.random() * alternateTops.length)]
    setOutfits((prev) => {
      const target = prev[selectedDirection]
      return {
        ...prev,
        [selectedDirection]: {
          ...target,
          rationale: reasonConstraint
            ? `Restyled for "${reasonConstraint}". Updated palette with ${randomTop.desc}.`
            : `Refreshed styling with ${randomTop.desc} for balanced wardrobe rotation.`,
          items: [randomTop, target.items[1], target.items[2]],
        },
      }
    })
    showToast("Outfit Restyled", reasonConstraint ? `Adjusted for: ${reasonConstraint}` : "New stylist variation loaded.", "info")
  }

  const swapOutfitItem = (index: number, replacementItem: WardrobeItem) => {
    setOutfitHistory((prev) => [currentOutfit, ...prev])
    setOutfits((prev) => {
      const target = prev[selectedDirection]
      const updated = [...target.items]
      updated[index] = {
        type: replacementItem.category.slice(0, -1) || "Piece",
        desc: replacementItem.name,
        color: replacementItem.color,
        emoji:
          replacementItem.category === "Tops"
            ? "👚"
            : replacementItem.category === "Bottoms"
              ? "👖"
              : "👟",
        reason: `Manually swapped for ${replacementItem.colorName}.`,
      }
      return {
        ...prev,
        [selectedDirection]: {
          ...target,
          items: updated,
        },
      }
    })
    showToast("Item Swapped", `Replaced with ${replacementItem.name}.`, "success")
  }

  const undoOutfit = (): boolean => {
    if (outfitHistory.length > 0) {
      const [reverted, ...rest] = outfitHistory
      setOutfits((prev) => ({
        ...prev,
        [reverted.direction as Direction]: reverted,
      }))
      setOutfitHistory(rest)
      showToast("Reverted", "Restored previous outfit combination.", "info")
      return true
    }
    return false
  }

  const addCustomStyle = (input: AddCustomStyleInput) => {
    const key = `custom_${Date.now()}`
    const accentColor = input.accent || "var(--pink)"
    const newOutfit: Outfit = {
      id: key,
      direction: key,
      label: input.label,
      tagline: input.tagline || "Custom recommendation",
      rationale:
        input.rationale ||
        `Custom look curated for "${input.label}". Balanced pieces chosen to fit your schedule and comfort needs.`,
      items: input.items,
      accent: accentColor,
      bg: accentColor.startsWith("var")
        ? "rgba(206,0,90,0.08)"
        : `${accentColor}18`,
      isCustom: true,
      whyDetails: input.whyDetails || {
        weatherReason: `Calibrated for comfortable wear in today's weather.`,
        colorHarmony: "Custom color composition curated by you.",
        wearFrequency: "Personalized recommendation added to your daily stylist rotation.",
        sensoryComfort: "Selected specifically to meet your tactile and silhouette preferences.",
      },
    }

    setOutfits((prev) => {
      const next = { ...prev, [key]: newOutfit }
      const saved = getStoredCustomStyles(currentUser.id)
      saved[key] = newOutfit
      saveStoredCustomStyles(currentUser.id, saved)
      return next
    })
    setSelectedDirection(key)
    setWornToday(false)
    showToast("Style Added", `"${input.label}" added to your recommendation styles.`, "success")
  }

  const removeCustomStyle = (directionKey: string) => {
    const removedLabel = outfits[directionKey]?.label || "Style"
    setOutfits((prev) => {
      const next = { ...prev }
      delete next[directionKey]
      const saved = getStoredCustomStyles(currentUser.id)
      delete saved[directionKey]
      saveStoredCustomStyles(currentUser.id, saved)

      if (selectedDirection === directionKey) {
        const fallbackDir =
          DEFAULT_DIRECTION_FOR_PERSONA[currentUser.id] || Object.keys(next)[0]
        setSelectedDirection(
          fallbackDir in next ? fallbackDir : Object.keys(next)[0],
        )
      }
      return next
    })
    showToast("Style Removed", `"${removedLabel}" removed.`, "info")
  }

  // Sync user & global accessibility classes
  useEffect(() => {
    try {
      localStorage.setItem("tailor_user", JSON.stringify(currentUser))
    } catch { }
  }, [currentUser])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("large-text", Boolean(currentUser.accessibility.largeText))
    root.classList.toggle("high-contrast-ui", Boolean(currentUser.accessibility.highContrastColors))
  }, [currentUser.accessibility.largeText, currentUser.accessibility.highContrastColors])

  useEffect(() => {
    try {
      const pid = (currentUser.id in PERSONA_WARDROBES ? currentUser.id : "eliora") as PersonaId
      localStorage.setItem(`tailor_wardrobe_${pid}`, JSON.stringify(wardrobe))
    } catch { }
  }, [wardrobe, currentUser.id])

  useEffect(() => {
    try {
      const pid = (currentUser.id in PERSONA_RECENT_LOOKS ? currentUser.id : "eliora") as PersonaId
      localStorage.setItem(`tailor_recent_looks_${pid}`, JSON.stringify(recentLooks))
    } catch { }
  }, [recentLooks, currentUser.id])

  const showToast = (
    title: string,
    message: string,
    type: "info" | "success" | "warning" = "info",
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setNotifications((prev) => {
      const duplicate = prev.some((n) => n.title === title && n.message === message)
      if (duplicate) return prev
      return [...prev, { id, title, message, type, timestamp: "Just now" }]
    })
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 4500)
  }

  const dismissToast = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const loadPersonaData = (pid: PersonaId) => {
    let loadedWardrobe: WardrobeItem[]
    try {
      const storedW = localStorage.getItem(`tailor_wardrobe_${pid}`)
      const parsed = storedW ? JSON.parse(storedW) : null
      loadedWardrobe = Array.isArray(parsed)
        ? ensureSeededTryOnItems(parsed)
        : getWardrobeForPersona(pid)
    } catch {
      loadedWardrobe = getWardrobeForPersona(pid)
    }
    setWardrobe(loadedWardrobe)
    try {
      const storedR = localStorage.getItem(`tailor_recent_looks_${pid}`)
      setRecentLooks(storedR ? JSON.parse(storedR) : getRecentLooksForPersona(pid))
    } catch {
      setRecentLooks(getRecentLooksForPersona(pid))
    }
    try {
      const storedFavs = localStorage.getItem(`tailor_favorite_outfit_objects_${pid}`)
      if (storedFavs !== null) {
        const parsedFavs = JSON.parse(storedFavs)
        if (Array.isArray(parsedFavs)) {
          const hydrated = hydrateFavoriteOutfits(parsedFavs, loadedWardrobe)
          if (hydrated.length === 1 && hydrated[0]?.id === "fav-blue-casual") {
            const defaults = buildDefaultFavoriteOutfits(loadedWardrobe, pid)
            const extras = defaults.filter((d) => d.id !== "fav-blue-casual")
            setFavoriteOutfits([...extras, ...hydrated])
          } else {
            setFavoriteOutfits(hydrated)
          }
        } else {
          setFavoriteOutfits(buildDefaultFavoriteOutfits(loadedWardrobe, pid))
        }
      } else {
        setFavoriteOutfits(buildDefaultFavoriteOutfits(loadedWardrobe, pid))
      }
    } catch {
      setFavoriteOutfits(buildDefaultFavoriteOutfits(loadedWardrobe, pid))
    }
  }

  const login = (customUser?: UserProfile) => {
    const userToSet = customUser || currentUser
    setCurrentUser(userToSet)
    setIsAuthenticated(true)
    setStylistNetworkErrorTriggered(false)
    const pid = (userToSet.id in PERSONA_OUTFITS ? userToSet.id : "eliora") as PersonaId
    loadPersonaData(pid)
    const loadedOutfits = getOutfitsForUser(pid)
    setOutfits(loadedOutfits)
    const defaultDir =
      DEFAULT_DIRECTION_FOR_PERSONA[pid] || Object.keys(loadedOutfits)[0]
    setSelectedDirection(
      defaultDir in loadedOutfits ? defaultDir : Object.keys(loadedOutfits)[0],
    )
    if (!hasGpsWeatherRef.current) {
      setWeather(PERSONA_WEATHER[pid] || PERSONA_WEATHER.eliora)
    }
    if (userToSet.accessibility.largeText) {
      setFontScaleState("md")
    }
    setWornToday(false)
    setOutfitHistory([])
  }

  const logout = () => {
    setIsAuthenticated(false)
    setStylistNetworkErrorTriggered(false)
    try {
      localStorage.removeItem("tailor_auth")
      sessionStorage.removeItem("tailor_auth")
    } catch { }
    showToast("Signed out", "You have been logged out of tAIlor.", "info")
  }

  const switchUser = (personaId: PersonaId) => {
    const selected = PRESET_PERSONAS[personaId]
    if (selected) {
      setCurrentUser(selected)
      setStylistNetworkErrorTriggered(false)
      loadPersonaData(personaId)
      const loadedOutfits = getOutfitsForUser(personaId)
      setOutfits(loadedOutfits)
      const defaultDir =
        DEFAULT_DIRECTION_FOR_PERSONA[personaId] || Object.keys(loadedOutfits)[0]
      setSelectedDirection(
        defaultDir in loadedOutfits
          ? defaultDir
          : Object.keys(loadedOutfits)[0],
      )
      if (!hasGpsWeatherRef.current) {
        setWeather(PERSONA_WEATHER[personaId] || PERSONA_WEATHER.eliora)
      }
      if (selected.accessibility.largeText) {
        setFontScaleState("md")
      }
      setWornToday(false)
      setOutfitHistory([])
      showToast(
        "Switched Persona",
        `Active profile: ${selected.name} (${selected.roleTitle})`,
        "info",
      )
    }
  }

  const updateAccessibility = (
    key: keyof UserProfile["accessibility"],
    val: boolean,
  ) => {
    setCurrentUser((prev) => ({
      ...prev,
      accessibility: {
        ...prev.accessibility,
        [key]: val,
      },
    }))
    if (key === "largeText") {
      setFontScaleState(val ? "md" : "sm")
    }
    const labels: Record<keyof UserProfile["accessibility"], string> = {
      highContrastColors: "High-Contrast Color Names",
      lowDecisionMode: "Simple / Low-Decision Mode",
      sensorySensitive: "Sensory-Safe Fabric Filter",
      voiceNarration: "Voice Read-Aloud",
      largeText: "Large Easy-Read Text",
      visionImpairment: "Vision Impairment Assistance",
    }
    showToast(
      "Accessibility Updated",
      `${labels[key]} turned ${val ? "ON" : "OFF"}`,
      "info",
    )
  }

  const applyQuizResult = (result: QuizResult) => {
    const { derived } = result
    setCurrentUser((prev) => ({
      ...prev,
      quizProfile: result,
      accessibility: {
        ...prev.accessibility,
        highContrastColors: derived.ui.high_contrast_ui || derived.ui.color_names,
        sensorySensitive: derived.filters.soft_fabric,
      },
      preferredStyle: derived.stylist.context
        ? `${derived.stylist.context} · ${derived.color?.palette || "Custom"}`
        : prev.preferredStyle,
    }))

    showToast(
      "Style Profile Applied",
      "Your quiz answers customized your stylist and UI settings.",
      "success",
    )
  }

  const addWardrobeItem = (itemData: Omit<WardrobeItem, "id">) => {
    const newItem: WardrobeItem = {
      ...itemData,
      id: Date.now(),
    }
    setWardrobe((prev) => [newItem, ...prev])
    showToast(
      "Item Added",
      `${newItem.name} saved to your digital wardrobe.`,
      "success",
    )
    return newItem
  }

  const updateWardrobeItem = (item: WardrobeItem) => {
    setWardrobe((prev) => prev.map((i) => (i.id === item.id ? item : i)))
    showToast("Updated", `${item.name} details saved.`, "info")
  }

  const deleteWardrobeItem = (id: number) => {
    const target = wardrobe.find((i) => i.id === id)
    setWardrobe((prev) => prev.filter((i) => i.id !== id))
    if (target) {
      showToast(
        "Item Removed",
        `${target.name} removed from wardrobe.`,
        "warning",
      )
    }
  }

  const toggleFavorite = (id: number) => {
    setWardrobe((prev) =>
      prev.map((i) => {
        if (i.id === id) {
          const nextFav = !i.favorite
          showToast(
            nextFav ? "Favorited ♥" : "Unfavorited",
            `${i.name} ${nextFav ? "added to" : "removed from"} favorites.`,
            "info",
          )
          return { ...i, favorite: nextFav }
        }
        return i
      }),
    )
  }

  const markItemWorn = (id: number) => {
    setWardrobe((prev) =>
      prev.map((i) => {
        if (i.id === id) {
          return { ...i, worn: i.worn + 1, lastWorn: "Today" }
        }
        return i
      }),
    )
  }

  const logOutfitWorn = (outfit: {
    label: string
    items: string[]
    color: string
    direction: string
  }) => {
    const todayName = new Date().toLocaleDateString("en-US", {
      weekday: "long",
    })
    const newLook: RecentLook = {
      id: `look-${Date.now()}`,
      day: todayName,
      date: "Today",
      color: outfit.color,
      items: outfit.items,
      direction: outfit.direction,
      occasion: "Worn today",
    }

    setRecentLooks((prev) => [newLook, ...prev])

    // Update wear count for matching items in wardrobe
    setWardrobe((prev) =>
      prev.map((wItem) => {
        const matches = outfit.items.some(
          (desc) =>
            desc.toLowerCase().includes(wItem.name.toLowerCase()) ||
            wItem.name.toLowerCase().includes(desc.toLowerCase()),
        )
        if (matches) {
          return { ...wItem, worn: wItem.worn + 1, lastWorn: "Today" }
        }
        return wItem
      }),
    )

    showToast(
      "Outfit Logged!",
      `Great choice! "${outfit.label}" logged to your wear history.`,
      "success",
    )
  }

  const sendOutfitToLaundry = (itemNames: string[]) => {
    setWardrobe((prev) =>
      prev.map((wItem) => {
        const matches = itemNames.some(
          (name) =>
            name.toLowerCase().includes(wItem.name.toLowerCase()) ||
            wItem.name.toLowerCase().includes(name.toLowerCase()),
        )
        if (matches) {
          return { ...wItem, status: "dirty" }
        }
        return wItem
      }),
    )
    showToast(
      "Sent to Laundry",
      `${itemNames.length} item(s) marked for washing.`,
      "info",
    )
  }

  const saveFavoriteOutfit = (outfit: FavoriteOutfit) => {
    setFavoriteOutfits((prev) => {
      const existsIndex = prev.findIndex((o) => o.id === outfit.id)
      if (existsIndex >= 0) {
        const next = [...prev]
        next[existsIndex] = outfit
        return next
      }
      return [outfit, ...prev]
    })
    setFavoriteOutfitIds((prev) =>
      prev.includes(outfit.id) ? prev : [outfit.id, ...prev],
    )
    showToast(
      "Outfit Favorited ❤️",
      `"${outfit.label}" saved to Favorite Outfits.`,
      "success",
    )
  }

  const removeFavoriteOutfit = (id: string) => {
    const target = favoriteOutfits.find((o) => o.id === id)
    setFavoriteOutfits((prev) => prev.filter((o) => o.id !== id))
    setFavoriteOutfitIds((prev) => prev.filter((fid) => fid !== id))
    showToast(
      "Removed from Favorites",
      target
        ? `"${target.label}" removed from Favorite Outfits.`
        : "Look removed from Favorite Outfits.",
      "info",
    )
  }

  const toggleFavoriteOutfit = (outfitId: string, outfitPayload?: FavoriteOutfit) => {
    const exists = favoriteOutfitIds.includes(outfitId)
    setFavoriteOutfitIds((prev) =>
      exists ? prev.filter((id) => id !== outfitId) : [...prev, outfitId],
    )

    const matchedSource =
      outfitPayload ||
      (String(currentOutfit?.id || currentOutfit?.label) === outfitId
        ? mapTodayOutfitToFavorite(currentOutfit, wardrobe)
        : (() => {
            const found = Object.values(outfits).find(
              (o) => String(o.id || o.label) === outfitId,
            )
            return found ? mapTodayOutfitToFavorite(found, wardrobe) : undefined
          })())

    if (matchedSource) {
      setFavoriteOutfits((prev) => {
        if (exists) {
          return prev.filter((o) => o.id !== outfitId && o.id !== matchedSource.id)
        }
        if (prev.some((o) => o.id === matchedSource.id)) return prev
        return [matchedSource, ...prev]
      })
    }

    showToast(
      exists ? "Removed from Favorites" : "Outfit Favorited ❤️",
      exists ? "Look removed from saved favorites." : "Look saved to your favorites.",
      "info",
    )
  }

  const saveOutfitFeedback = (outfitId: string, notes: string, reasons?: string[]) => {
    const timestamp = new Date().toISOString()
    setOutfitFeedbackNotes((prev) => ({
      ...prev,
      [outfitId]: { notes, reasons, timestamp },
    }))
    showToast(
      "Feedback Recorded",
      "Your outfit notes have been saved to your styling preferences.",
      "success",
    )
  }

  const saveGarmentFeedback = (itemId: string, notes: string, reasons?: string[]) => {
    const timestamp = new Date().toISOString()
    setGarmentFeedbackNotes((prev) => ({
      ...prev,
      [itemId]: { notes, reasons, timestamp },
    }))
    showToast(
      "Feedback Recorded",
      "Your garment notes have been saved.",
      "success",
    )
  }

  return (
    <AppContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        user: currentUser,
        isAuthenticated,
        login,
        logout,
        switchUser,
        updateAccessibility,
        applyQuizResult,
        wardrobe,
        addWardrobeItem,
        updateWardrobeItem,
        deleteWardrobeItem,
        toggleFavorite,
        markItemWorn,
        recentLooks,
        logOutfitWorn,
        sendOutfitToLaundry,
        notifications,
        showToast,
        dismissToast,
        outfits,
        selectedDirection,
        setSelectedDirection,
        defaultDirection:
          DEFAULT_DIRECTION_FOR_PERSONA[currentUser.id] || "pastel_goth",
        addCustomStyle,
        removeCustomStyle,
        currentOutfit,
        wornToday,
        setWornToday,
        regenerateOutfit,
        swapOutfitItem,
        undoOutfit,
        hasUndo: outfitHistory.length > 0,
        weather,
        refreshWeather,
        stylistNetworkErrorTriggered,
        setStylistNetworkErrorTriggered,
        fontScale,
        setFontScale,
        accessibleFont,
        setAccessibleFont,
        favoriteOutfitIds,
        favoriteOutfits,
        toggleFavoriteOutfit,
        saveFavoriteOutfit,
        removeFavoriteOutfit,
        activeTryOnOutfit,
        setActiveTryOnOutfit,
        requestedTab,
        setRequestedTab,
        outfitFeedbackNotes,
        saveOutfitFeedback,
        garmentFeedbackNotes,
        saveGarmentFeedback,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}