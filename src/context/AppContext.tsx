import React, { createContext, useContext, useState, useEffect } from "react"
import type {
  UserProfile,
  WardrobeItem,
  RecentLook,
  AppNotification,
  PersonaId,
  Outfit,
} from "../types"

export const PRESET_PERSONAS: Record<PersonaId, UserProfile> = {
  eliora: {
    id: "eliora",
    name: "Eliora Browning",
    initials: "EB",
    email: "eliora.browning@example.com",
    avatarBg: "#D40067",
    roleTitle: "Front-End & Proposal Research · IT Senior",
    preferredStyle: "Polished · colorful · comfortable",
    typicalSizes: "Tops M · Bottoms 8 · Shoes 8",
    homeClimate: "Mild and changeable (68°F)",
    stylistNotes:
      "Likes bold magenta & teal focal points grounded by warm camel and black neutrals.",
    accessibility: {
      highContrastColors: false,
      sensorySensitive: true,
      lowDecisionMode: false,
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
    roleTitle: "Team Leader & Project Planner · IT Senior",
    preferredStyle: "Creative chic · dynamic layers · statement accents",
    typicalSizes: "Tops S · Bottoms 4 · Shoes 7",
    homeClimate: "Humid subtropical (75°F)",
    stylistNotes:
      "Loves bold creative palettes with gold accents and digital wardrobe curation.",
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

export const INITIAL_RECENT_LOOKS: RecentLook[] = [
  {
    id: "look-1",
    day: "Wednesday",
    date: "Yesterday",
    color: "#007A8A",
    items: ["Teal trench", "Black wide-legs", "White sneakers"],
    direction: "Stylish",
    occasion: "Campus & meetings",
  },
  {
    id: "look-2",
    day: "Tuesday",
    date: "2 days ago",
    color: "#D40067",
    items: ["Magenta blouse", "Camel trousers", "Tan loafers"],
    direction: "Stylish",
    occasion: "Project presentation",
  },
  {
    id: "look-3",
    day: "Monday",
    date: "3 days ago",
    color: "#2B4B8C",
    items: ["Navy tee", "Slim jeans", "White sneakers"],
    direction: "Safe",
    occasion: "Casual study day",
  },
  {
    id: "look-4",
    day: "Sunday",
    date: "4 days ago",
    color: "#C8965A",
    items: ["Cream blouse", "Camel trousers", "Tan loafers"],
    direction: "Rediscover",
    occasion: "Family brunch",
  },
  {
    id: "look-5",
    day: "Saturday",
    date: "5 days ago",
    color: "#B4F0C0",
    items: ["Mint mock-neck", "Black wide-legs", "Platforms"],
    direction: "Rediscover",
    occasion: "Art gallery visit",
  },
  {
    id: "look-6",
    day: "Friday",
    date: "6 days ago",
    color: "#FFD83D",
    items: ["Gold hoops", "Slim jeans", "Navy tee"],
    direction: "Safe",
    occasion: "Dinner with friends",
  },
]

interface AppContextType {
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
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Authentication state - initialize from localStorage if available, default to authenticated as Eliora for smooth HCI demo, but user can log out
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("tailor_auth")
      return stored !== null ? JSON.parse(stored) : true
    } catch {
      return true
    }
  })

  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    try {
      const stored = localStorage.getItem("tailor_user")
      if (stored) return JSON.parse(stored)
    } catch {}
    return PRESET_PERSONAS.eliora
  })

  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>(() => {
    try {
      const stored = localStorage.getItem("tailor_wardrobe")
      if (stored) return JSON.parse(stored)
    } catch {}
    return INITIAL_ITEMS
  })

  const [recentLooks, setRecentLooks] = useState<RecentLook[]>(() => {
    try {
      const stored = localStorage.getItem("tailor_recent_looks")
      if (stored) return JSON.parse(stored)
    } catch {}
    return INITIAL_RECENT_LOOKS
  })

  const [notifications, setNotifications] = useState<AppNotification[]>([])

  // Sync auth & user
  useEffect(() => {
    try {
      localStorage.setItem("tailor_auth", JSON.stringify(isAuthenticated))
      localStorage.setItem("tailor_user", JSON.stringify(currentUser))
    } catch {}
  }, [isAuthenticated, currentUser])

  useEffect(() => {
    try {
      localStorage.setItem("tailor_wardrobe", JSON.stringify(wardrobe))
    } catch {}
  }, [wardrobe])

  useEffect(() => {
    try {
      localStorage.setItem("tailor_recent_looks", JSON.stringify(recentLooks))
    } catch {}
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
    if (customUser) {
      setCurrentUser(customUser)
    }
    setIsAuthenticated(true)
    showToast(
      "Welcome back!",
      `Signed in as ${customUser?.name || currentUser.name}`,
      "success",
    )
  }

  const logout = () => {
    setIsAuthenticated(false)
    showToast("Signed out", "You have been logged out of tAIlor.", "info")
  }

  const switchUser = (personaId: PersonaId) => {
    const selected = PRESET_PERSONAS[personaId]
    if (selected) {
      setCurrentUser(selected)
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
