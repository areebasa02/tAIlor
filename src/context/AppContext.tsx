import React, { createContext, useContext, useState, useEffect } from "react"
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
} from "../types"
import { getContrastTextColor } from "../types"

export { getContrastTextColor }

export const PRESET_PERSONAS: Record<PersonaId, UserProfile> = {
  eliora: {
    id: "eliora",
    name: "Eliora Browning",
    initials: "EB",
    email: "eliora.browning@example.com",
    avatarBg: "#ffb4d8ff",
    roleTitle: "Front-End & Proposal Research",
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
    },
  },
  ethan: {
    id: "ethan",
    name: "Ethan Carter",
    initials: "EC",
    email: "ethan.carter@example.com",
    avatarBg: "#007A8A",
    roleTitle: "Networking & Professional · Flow 01 Persona",
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
    },
  },
  jordan: {
    id: "jordan",
    name: "Jordan Miller",
    initials: "JM",
    email: "jordan.miller@example.com",
    avatarBg: "#3BBF6C",
    roleTitle: "Outfit Discovery & Decision Fatigue · Flow 02 Persona",
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
    },
  },
  josephine: {
    id: "josephine",
    name: "Josephine Davis",
    initials: "JD",
    email: "josephine.davis@example.com",
    avatarBg: "#FFD83D",
    roleTitle: "Color Accessibility & Tactile · Flow 03 Persona",
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
    },
  },
  areeba: {
    id: "areeba",
    name: "Areeba Ahmad",
    initials: "AA",
    email: "areeba.ahmad@example.com",
    avatarBg: "#E84B1A",
    roleTitle: "Team Leader & Project Planner",
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
    },
  },
}

export const INITIAL_ITEMS: WardrobeItem[] = [
  {
    id: 1,
    name: "Magenta button-down",
    category: "Tops",
    color: "#D40067",
    colorName: "Vivid Magenta",
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
    color: "#B4F0C0",
    colorName: "Soft Mint",
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
    color: "#007A8A",
    colorName: "Deep Teal",
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
    color: "#FFD83D",
    colorName: "Warm 18K Gold",
    worn: 50,
    favorite: true,
    material: "Hypoallergenic Gold Vermeil",
    storageLocation: "Jewelry Box · Vanity Top",
    careInstructions: "Polish with microfiber cloth",
    sentimentalValue: "High",
    cost: "$45",
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
      color: "#007A8A",
      items: ["Teal trench", "Black wide-legs", "White sneakers"],
      direction: "Stylish",
      occasion: "Campus & meetings",
    },
    {
      id: "look-2",
      day: getOffsetDay(2),
      date: "2 days ago",
      color: "#D40067",
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
      color: "#B4F0C0",
      items: ["Mint mock-neck", "Black wide-legs", "Platforms"],
      direction: "Rediscover",
      occasion: "Art gallery visit",
    },
    {
      id: "look-6",
      day: getOffsetDay(6),
      date: "6 days ago",
      color: "#FFD83D",
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
      bg: "rgba(245,160,181,0.08)",
      items: [
        {
          type: "Top",
          desc: "Pastel pink tailored blouse",
          color: "#FFB4D8",
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
      accent: "var(--magenta)",
      bg: "rgba(212,0,103,0.08)",
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
      accent: "var(--sky)",
      bg: "rgba(114,212,240,0.08)",
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
      accent: "var(--mint)",
      bg: "rgba(180,240,192,0.08)",
      items: [
        {
          type: "Top",
          desc: "Mint ribbed mock-neck",
          color: "#B4F0C0",
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
      accent: "var(--sky)",
      bg: "rgba(114,212,240,0.08)",
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
      accent: "var(--teal)",
      bg: "rgba(0,122,138,0.08)",
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
      accent: "var(--yellow)",
      bg: "rgba(255,216,61,0.08)",
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
      accent: "var(--orange)",
      bg: "rgba(232,75,26,0.08)",
      items: [
        {
          type: "Top",
          desc: "Teal trench coat",
          color: "#007A8A",
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
      accent: "var(--sky)",
      bg: "rgba(114,212,240,0.08)",
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
      bg: "rgba(59,191,108,0.08)",
      items: [
        {
          type: "Top",
          desc: "Mint ribbed mock-neck",
          color: "#B4F0C0",
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
      accent: "var(--orange)",
      bg: "rgba(232,75,26,0.08)",
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
      accent: "var(--yellow)",
      bg: "rgba(255,216,61,0.08)",
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
      accent: "var(--yellow)",
      bg: "rgba(255,216,61,0.08)",
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
      accent: "var(--mint)",
      bg: "rgba(180,240,192,0.08)",
      items: [
        {
          type: "Top",
          desc: "Mint ribbed mock-neck",
          color: "#B4F0C0",
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
      accent: "var(--sky)",
      bg: "rgba(114,212,240,0.08)",
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
      accent: "var(--magenta)",
      bg: "rgba(212,0,103,0.08)",
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
      accent: "var(--yellow)",
      bg: "rgba(255,216,61,0.08)",
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
      accent: "var(--orange)",
      bg: "rgba(232,75,26,0.08)",
      items: [
        {
          type: "Top",
          desc: "Teal trench coat",
          color: "#007A8A",
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
      accent: "var(--magenta)",
      bg: "rgba(212,0,103,0.08)",
      items: [
        {
          type: "Top",
          desc: "Magenta button-down",
          color: "#D40067",
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
      accent: "var(--sky)",
      bg: "rgba(114,212,240,0.08)",
      items: [
        {
          type: "Top",
          desc: "Mint ribbed mock-neck",
          color: "#B4F0C0",
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

export interface AppContextType {
  user: UserProfile
  isAuthenticated: boolean
  login: (user?: UserProfile) => void
  logout: () => void
  switchUser: (personaId: PersonaId) => void
  updateAccessibility: (
    key: keyof UserProfile["accessibility"],
    val: boolean,
  ) => void
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
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Authentication state - starts unauthenticated so the site always opens to the login page
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      localStorage.removeItem("tailor_auth")
      sessionStorage.removeItem("tailor_auth")
    } catch { }
    return false
  })

  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    try {
      const stored = localStorage.getItem("tailor_user")
      if (stored) return JSON.parse(stored)
    } catch { }
    return PRESET_PERSONAS.eliora
  })

  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>(() => {
    try {
      const stored = localStorage.getItem("tailor_wardrobe")
      if (stored) return JSON.parse(stored)
    } catch { }
    return INITIAL_ITEMS
  })

  const [recentLooks, setRecentLooks] = useState<RecentLook[]>(() => {
    try {
      const stored = localStorage.getItem("tailor_recent_looks")
      if (stored) return JSON.parse(stored)
    } catch { }
    return INITIAL_RECENT_LOOKS
  })

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

  // Weather & Climate State managed in AppContext
  const [weather, setWeather] = useState<WeatherData>(() => {
    return PERSONA_WEATHER[currentUser.id] || PERSONA_WEATHER.eliora
  })

  const currentOutfit = outfits[selectedDirection] || Object.values(outfits)[0]

  const refreshWeather = () => {
    const variations: Record<PersonaId, WeatherData[]> = {
      eliora: [
        { city: "Hammond, LA", temp: "58°F", condition: "Breezy & Cool · 58°F", advice: "Crisp autumn air. Layering your favorite soft knit or jacket keeps you warm and sensory-comfortable.", icon: "⛅" },
        { city: "Hammond, LA", temp: "54°F", condition: "Chilly & Overcast · 54°F", advice: "Cool breeze coming in. Long sleeves and comfortable lined trousers recommended.", icon: "☁️" },
        { city: "Hammond, LA", temp: "62°F", condition: "Mild & Clear · 62°F", advice: "Crisp sun with gentle cool breeze. Perfect for relaxed layers.", icon: "🌤️" },
      ],
      ethan: [
        { city: "Hammond, LA", temp: "64°F", condition: "Clear & Breezy · 64°F", advice: "Crisp urban breeze. Structured blazer or jacket recommended for evening networking.", icon: "🏙️" },
        { city: "Hammond, LA", temp: "67°F", condition: "Sunny & Sharp · 67°F", advice: "Mild afternoon weather. Oxford shirt and chinos provide optimal ventilation.", icon: "☀️" },
      ],
      jordan: [
        { city: "Hammond, LA", temp: "72°F", condition: "Sunny & Mild · 72°F", advice: "Warm sunny afternoon. Breathable cotton layers prevent morning-to-afternoon decision fatigue.", icon: "☀️" },
        { city: "Hammond, LA", temp: "69°F", condition: "Partly Cloudy · 69°F", advice: "Gentle cloud cover. Low-decision classic tee and jeans are comfortable all day.", icon: "⛅" },
      ],
      josephine: [
        { city: "Hammond, LA", temp: "70°F", condition: "Pleasant & Clear · 70°F", advice: "Soft natural fibers and breathable textures keep you comfortable throughout the day.", icon: "🌤️" },
        { city: "Hammond, LA", temp: "68°F", condition: "Mild & Calm · 68°F", advice: "Gentle natural air. Soft tagless fabrics provide zero skin irritation.", icon: "⛅" },
      ],
      areeba: [
        { city: "Hammond, LA", temp: "75°F", condition: "Humid Subtropical · 75°F", advice: "Warm subtropical air. Light dynamic layers with statement accessories shine today.", icon: "✨" },
        { city: "Hammond, LA", temp: "78°F", condition: "Sunny & Warm · 78°F", advice: "Balmy sunshine. Statement trench can be draped or carried for effortless style.", icon: "☀️" },
      ],
    }
    const list = variations[currentUser.id] || variations.eliora
    const next = list[Math.floor(Math.random() * list.length)]
    setWeather(next)
    showToast("Weather Refreshed", `Updated forecast for ${next.city}: ${next.temp}`, "info")
  }

  const regenerateOutfit = (reasonConstraint?: string) => {
    setOutfitHistory((prev) => [currentOutfit, ...prev])
    setWornToday(false)
    const alternateTops: OutfitItem[] = [
      { type: "Top", desc: "Cream linen blouse", color: "#F5EFD8", emoji: "👚", reason: "Crisp light layer with gentle drape." },
      { type: "Top", desc: "Teal trench coat", color: "#007A8A", emoji: "🧥", reason: "Polished statement top layer." },
      { type: "Top", desc: "Navy relaxed crew tee", color: "#2B4B8C", emoji: "👕", reason: "Minimalist neutral base." },
      { type: "Top", desc: "Burgundy soft scoop tee", color: "#6A1A32", emoji: "👕", reason: "Deep burgundy soft cotton staple." },
      { type: "Top", desc: "Mint ribbed mock-neck", color: "#B4F0C0", emoji: "🧶", reason: "Textured pastel rediscovery." },
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
    const accentColor = input.accent || "var(--magenta)"
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
        ? "rgba(212,0,103,0.08)"
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

  // Sync user
  useEffect(() => {
    try {
      localStorage.setItem("tailor_user", JSON.stringify(currentUser))
    } catch { }
  }, [currentUser])

  useEffect(() => {
    try {
      localStorage.setItem("tailor_wardrobe", JSON.stringify(wardrobe))
    } catch { }
  }, [wardrobe])

  useEffect(() => {
    try {
      localStorage.setItem("tailor_recent_looks", JSON.stringify(recentLooks))
    } catch { }
  }, [recentLooks])

  const showToast = (
    title: string,
    message: string,
    type: "info" | "success" | "warning" = "info",
  ) => {
    const id = Date.now().toString()
    setNotifications((prev) => [
      ...prev,
      { id, title, message, type, timestamp: "Just now" },
    ])
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 4500)
  }

  const dismissToast = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const login = (customUser?: UserProfile) => {
    const userToSet = customUser || currentUser
    setCurrentUser(userToSet)
    setIsAuthenticated(true)
    const pid = (userToSet.id in PERSONA_OUTFITS ? userToSet.id : "eliora") as PersonaId
    const loadedOutfits = getOutfitsForUser(pid)
    setOutfits(loadedOutfits)
    const defaultDir =
      DEFAULT_DIRECTION_FOR_PERSONA[pid] || Object.keys(loadedOutfits)[0]
    setSelectedDirection(
      defaultDir in loadedOutfits ? defaultDir : Object.keys(loadedOutfits)[0],
    )
    setWeather(PERSONA_WEATHER[pid] || PERSONA_WEATHER.eliora)
    setWornToday(false)
    setOutfitHistory([])
    showToast(
      "Welcome back!",
      `Signed in as ${userToSet.name}`,
      "success",
    )
  }

  const logout = () => {
    setIsAuthenticated(false)
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
      const loadedOutfits = getOutfitsForUser(personaId)
      setOutfits(loadedOutfits)
      const defaultDir =
        DEFAULT_DIRECTION_FOR_PERSONA[personaId] || Object.keys(loadedOutfits)[0]
      setSelectedDirection(
        defaultDir in loadedOutfits
          ? defaultDir
          : Object.keys(loadedOutfits)[0],
      )
      setWeather(PERSONA_WEATHER[personaId] || PERSONA_WEATHER.eliora)
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
    showToast(
      "Preference Updated",
      `${key} set to ${val ? "ON" : "OFF"}`,
      "info",
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

  return (
    <AppContext.Provider
      value={{
        user: currentUser,
        isAuthenticated,
        login,
        logout,
        switchUser,
        updateAccessibility,
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
