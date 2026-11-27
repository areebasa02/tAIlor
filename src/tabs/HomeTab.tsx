import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CloudSun,
  Lightbulb,
  MapPin,
  MessageSquare,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Star,
  Volume2,
  WashingMachine,
  X,
  Zap,
} from "lucide-react";
import {
  AIErrorBanner,
  UserControlBar,
  WhyItWorksDisclosure,
  OutfitFeedbackModal,
  GarmentFeedbackModal,
  type ControlMode,
} from "../components/AIComponents";
import { AddStyleModal } from "../components/AddStyleModal";
import { BottomSheet } from "../components/BottomSheet";
import { useApp } from "../context/AppContext";
import { getSampleGarmentImage } from "../data/personaData";
import {
  getGarmentEmoji,
  normalizeGarmentSlot,
  swapMatchesCategory,
} from "../lib/garmentCategories";
import {
  getOutfitItemSelectionTags,
  getReadableColorLabel,
  speakText,
  stopSpeaking,
} from "../services/accessibilityHelpers";
import { formatAiErrorMessage } from "../lib/aiHost";
import {
  searchCities,
  type CitySearchResult,
} from "../services/weatherService";
import type { OutfitItem } from "../types";
import { THEME_COLORS } from "../types/theme";

function locationSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case "gps":
      return "Current location";
    case "city":
      return "City search";
    case "ip":
      return "Approx. from network";
    case "last-known":
      return "Saved location";
    case "hammond":
      return "Default · Hammond, LA";
    case "fallback":
      return "Cached";
    default:
      return "Live weather";
  }
}

function getPieceEmoji(typeOrCategory: string, itemName = ""): string {
  return getGarmentEmoji(typeOrCategory, itemName, "👗");
}

export default function HomeTab() {
  const {
    user,
    recentLooks,
    logOutfitWorn,
    sendOutfitToLaundry,
    wardrobe,
    outfits,
    selectedDirection,
    setSelectedDirection,
    defaultDirection,
    removeCustomStyle,
    currentOutfit,
    todayOutfit,
    generateTodayOutfit,
    wornToday,
    setWornToday,
    swapOutfitItem,
    toggleOutfitAccessory,
    weather,
    liveWeatherReady,
    weatherAdviceLoading,
    weatherLocationSource,
    weatherLocating,
    refreshWeather,
    useCurrentLocationWeather,
    setWeatherCity,
    showToast,
    favoriteOutfitIds,
    toggleFavoriteOutfit,
    saveOutfitFeedback,
    saveGarmentFeedback,
    setActiveTryOnOutfit,
    setRequestedTab,
    setPendingStylistPrompt,
    calendarEvents,
  } = useApp();

  const [loading, setLoading] = useState(false);
  const [todayOutfitError, setTodayOutfitError] = useState("");
  const [ctrlMode, setCtrlMode] = useState<ControlMode>("default");
  const [whyModalOpen, setWhyModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [customRejectReason, setCustomRejectReason] = useState("");
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapTargetIndex, setSwapTargetIndex] = useState<number | null>(null);
  const [accessoriesSheetOpen, setAccessoriesSheetOpen] = useState(false);
  const [addStyleModalOpen, setAddStyleModalOpen] = useState(false);
  const [speakingOutfit, setSpeakingOutfit] = useState(false);
  const [showRecentHistory, setShowRecentHistory] = useState(false);
  const [outfitFeedbackModalOpen, setOutfitFeedbackModalOpen] = useState(false);
  const [garmentFeedbackTarget, setGarmentFeedbackTarget] = useState<{
    item: OutfitItem;
    index: number;
  } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CitySearchResult[]>([]);
  const [citySearching, setCitySearching] = useState(false);
  const [weatherDrawerOpen, setWeatherDrawerOpen] = useState(false);
  const [climateNoteOpen, setClimateNoteOpen] = useState(false);
  const citySearchTimerRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (citySearchTimerRef.current) {
      window.clearTimeout(citySearchTimerRef.current);
    }
    const trimmed = cityQuery.trim();
    if (trimmed.length < 2) {
      setCityResults([]);
      setCitySearching(false);
      return;
    }
    setCitySearching(true);
    const controller = new AbortController();
    citySearchTimerRef.current = window.setTimeout(() => {
      void searchCities(trimmed, controller.signal)
        .then((results) => setCityResults(results))
        .catch(() => {
          if (!controller.signal.aborted) setCityResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setCitySearching(false);
        });
    }, 280);
    return () => {
      controller.abort();
      if (citySearchTimerRef.current) {
        window.clearTimeout(citySearchTimerRef.current);
      }
    };
  }, [cityQuery]);

  const clockTimeZone =
    weather.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const liveDateLabel = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: clockTimeZone,
  });
  const liveTimeLabel = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: clockTimeZone,
  });

  const showListen = Boolean(
    user.accessibility.visionImpairment || user.accessibility.voiceNarration,
  );

  const handleToggleListen = () => {
    if (speakingOutfit) {
      stopSpeaking();
      setSpeakingOutfit(false);
      return;
    }
    if (!currentOutfit) return;
    const pieces = currentOutfit.items
      .map(
        (item) =>
          `${item.type}: ${item.desc}, color ${getReadableColorLabel(item.color, item.desc, wardrobe)}`,
      )
      .join(". ");
    const speech = `Today's recommended outfit is ${currentOutfit.label}: ${currentOutfit.tagline}. Weather in ${weather.city.split(",")[0]} is ${weather.temp}. Pieces: ${pieces}. Stylist note: ${currentOutfit.rationale}`;
    const started = speakText(speech, () => setSpeakingOutfit(false));
    if (started) {
      setSpeakingOutfit(true);
    } else {
      showToast(
        "Audio Unavailable",
        "Voice narration is not supported in this browser.",
        "warning",
      );
    }
  };

  const handleRegenerate = (
    reasonConstraint?: string,
    directionOverride?: string,
  ) => {
    setLoading(true);
    setTodayOutfitError("");
    setCtrlMode("regenerating");
    void generateTodayOutfit(reasonConstraint, true, directionOverride)
      .catch((error: unknown) => {
        const message = formatAiErrorMessage(
          error,
          "Could not generate today's outfit.",
        );
        setTodayOutfitError(message);
        showToast("Today's outfit unavailable", message, "warning");
      })
      .finally(() => {
        setLoading(false);
        setCtrlMode("default");
      });
  };

  useEffect(() => {
    if (!liveWeatherReady) {
      setLoading(true);
      return;
    }
    if (todayOutfit) {
      setLoading(false);
      setTodayOutfitError("");
      return;
    }

    let active = true;
    setLoading(true);
    setTodayOutfitError("");
    void generateTodayOutfit(undefined, false, selectedDirection)
      .catch((error: unknown) => {
        if (active) {
          setTodayOutfitError(
            formatAiErrorMessage(error, "Could not generate today's outfit."),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [todayOutfit, user.id, localDay, selectedDirection, liveWeatherReady]);

  const handleApprove = () => {
    logOutfitWorn({
      label: currentOutfit.label,
      items: currentOutfit.items.map((i) => i.desc),
      color: currentOutfit.items[0]?.color || THEME_COLORS.pink,
      direction: currentOutfit.label,
    });
    setWornToday(true);
    setCtrlMode("default");
  };

  const handleSwapItem = (replacementItem: (typeof wardrobe)[0]) => {
    if (swapTargetIndex === null) return;
    swapOutfitItem(swapTargetIndex, replacementItem);
    setSwapModalOpen(false);
    setSwapTargetIndex(null);
  };

  const shortCity = weather.city.split(",")[0] || weather.city;

  const localHour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: clockTimeZone,
    }).format(now),
  );
  const timeGreeting =
    localHour < 12
      ? "Good morning"
      : localHour < 17
        ? "Good afternoon"
        : "Good evening";

  const nextEvent = (() => {
    if (!calendarEvents || calendarEvents.length === 0) return null;
    const nowMs = now.getTime();
    const parsed = calendarEvents
      .map((ev) => {
        const ts = Date.parse(ev.dtstart);
        return { ev, ts };
      })
      .filter((entry) => !Number.isNaN(entry.ts) && entry.ts >= nowMs - 30 * 60 * 1000)
      .sort((a, b) => a.ts - b.ts);
    return parsed[0]?.ev || calendarEvents[0] || null;
  })();

  const directionKeys = Object.keys(outfits);
  const currentDirIdx = directionKeys.indexOf(selectedDirection);

  const cycleDirection = (delta: -1 | 1) => {
    if (loading || directionKeys.length < 2) return;
    const base = currentDirIdx === -1 ? 0 : currentDirIdx;
    const nextIdx = (base + delta + directionKeys.length) % directionKeys.length;
    setSelectedDirection(directionKeys[nextIdx]);
    setCtrlMode("default");
    setWornToday(false);
    setTodayOutfitError("");
  };

  const handleCardTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
  };

  const handleCardTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStartXRef.current;
    const dy = t.clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      cycleDirection(dx < 0 ? 1 : -1);
    }
  };

  const openTryOnForCurrentOutfit = () => {
    if (!currentOutfit) return;
    const items = currentOutfit.items.map((piece) => {
      const match = wardrobe.find(
        (w) =>
          w.name.trim().toLowerCase() === piece.desc.trim().toLowerCase(),
      );
      const slot = normalizeGarmentSlot(piece.type, piece.desc);
      return {
        type: slot,
        name: piece.desc,
        color: piece.color,
        emoji: getPieceEmoji(piece.type, piece.desc),
        imageData:
          match?.imageData || getSampleGarmentImage(piece.desc, piece.type),
        wardrobeItemId: match?.id,
      };
    });
    setActiveTryOnOutfit({
      id: `today-${String(currentOutfit.id || currentOutfit.direction || currentOutfit.label)}`,
      label: currentOutfit.label,
      tagline: currentOutfit.tagline || "Today's outfit",
      colors: items.map((i) => i.color).slice(0, 3),
      items,
    });
    setRequestedTab("tryon");
  };

  const wardrobeAccessories = wardrobe.filter(
    (w) => normalizeGarmentSlot(w.category, w.name) === "Accessory",
  );

  const coreEntries = (currentOutfit?.items || [])
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => normalizeGarmentSlot(item.type, item.desc) !== "Accessory");

  const accessoryEntries = (currentOutfit?.items || [])
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => normalizeGarmentSlot(item.type, item.desc) === "Accessory");

  const isAccessoryWorn = (wItem: (typeof wardrobe)[0]) =>
    accessoryEntries.some(
      ({ item }) =>
        item.desc.trim().toLowerCase() === wItem.name.trim().toLowerCase(),
    );

  return (
    <div className="pt-1.5 pb-3 space-y-3">
      {/* 1. Open Editorial Greeting + 1-Tap Compact Weather Pill */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-2 px-0.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground leading-snug">
              {liveDateLabel} ·{" "}
              <span className="tabular-nums" title={`Local time · ${clockTimeZone}`}>
                {liveTimeLabel}
              </span>
            </p>
            <h1 className="font-editorial text-[24px] min-[390px]:text-[26px] font-bold tracking-tight leading-tight text-foreground mt-0.5">
              {timeGreeting}, {user.name.split(" ")[0]}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setWeatherDrawerOpen((open) => !open)}
            aria-expanded={weatherDrawerOpen}
            aria-label={`Weather in ${weather.city}: ${weather.temp}. Tap to change city or refresh.`}
            className="lumina-card inline-flex items-center gap-2 px-3 py-1.5 min-h-[38px] rounded-full transition-all active:scale-95 shrink-0 hover:border-turquoise/60 cursor-pointer"
          >
            <CloudSun className="w-4 h-4 text-gold shrink-0" strokeWidth={2} />
            <span className="text-xs font-bold text-foreground whitespace-nowrap">
              {weather.temp}
            </span>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap max-w-[5.5rem] truncate hidden min-[350px]:inline">
              {shortCity}
            </span>
            {weatherDrawerOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
          </button>
        </div>

        {/* Contextual Next Calendar Event Pill */}
        {nextEvent && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-full bg-card/75 border border-border text-[11px]">
            <button
              type="button"
              onClick={() => setRequestedTab("calendar")}
              className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer hover:opacity-85"
            >
              <Calendar className="w-3.5 h-3.5 text-pink shrink-0" />
              <span className="font-semibold text-muted-foreground shrink-0">
                Up next:
              </span>
              <span className="font-semibold text-foreground truncate">
                {nextEvent.summary}
              </span>
              {nextEvent.timeLabel && (
                <span className="text-muted-foreground shrink-0 hidden min-[370px]:inline">
                  · {nextEvent.timeLabel}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingStylistPrompt(
                  `Style an outfit for "${nextEvent.summary}"${nextEvent.timeLabel ? ` at ${nextEvent.timeLabel}` : ""} in today's ${weather.temp} weather.`,
                );
                setRequestedTab("generator");
              }}
              className="text-[10.5px] font-bold text-turquoise hover:underline shrink-0 cursor-pointer"
            >
              Style →
            </button>
          </div>
        )}

        {/* 1-Tap Collapsible Weather & Location Drawer */}
        {weatherDrawerOpen && (
          <div className="lumina-card rounded-2xl p-3 space-y-2.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground truncate">
                  {weather.city}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {locationSourceLabel(weatherLocationSource || weather.locationSource)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void useCurrentLocationWeather()}
                  disabled={weatherLocating}
                  className="min-h-[32px] px-2.5 rounded-full text-[11px] font-semibold border border-turquoise/40 bg-turquoise/10 text-foreground hover:bg-turquoise/18 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <MapPin className="w-3 h-3 text-turquoise" />
                  <span>{weatherLocating ? "Locating…" : "GPS"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void refreshWeather()}
                  disabled={weatherLocating || weatherAdviceLoading}
                  aria-label="Refresh weather"
                  className="w-8 h-8 rounded-full border border-border bg-muted/70 text-foreground hover:border-turquoise flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      weatherLocating || weatherAdviceLoading ? "animate-spin" : ""
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <label htmlFor="home-city-search" className="sr-only">
                Search city for weather
              </label>
              <input
                id="home-city-search"
                type="search"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="Switch city (e.g. New Orleans)"
                className="w-full min-h-[38px] rounded-xl border border-border bg-muted/60 pl-8 pr-3 text-xs font-medium text-foreground outline-none focus:border-turquoise"
              />
            </div>

            {citySearching && (
              <p className="text-[11px] text-muted-foreground px-1">Searching…</p>
            )}

            {cityResults.length > 0 && (
              <ul className="space-y-1" role="listbox" aria-label="City search results">
                {cityResults.map((result) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      role="option"
                      onClick={() => {
                        void setWeatherCity(result).then(() => {
                          setWeatherDrawerOpen(false);
                          setCityQuery("");
                          setCityResults([]);
                        });
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold border border-border bg-muted/50 text-foreground hover:border-turquoise cursor-pointer"
                    >
                      {result.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Compact Collapsible AI Climate Note + 1-Tap Stylist Handoff */}
        <div className="lumina-card rounded-2xl overflow-hidden border-turquoise/25">
          <button
            type="button"
            onClick={() => setClimateNoteOpen((open) => !open)}
            aria-expanded={climateNoteOpen}
            className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-left hover:bg-muted/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Sparkles className="w-4 h-4 text-gold shrink-0" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground leading-snug line-clamp-1">
                  <span className="font-bold text-turquoise">
                    {weatherAdviceLoading
                      ? "Asking AI…"
                      : weather.adviceSource === "ai"
                        ? "Climate Note · "
                        : "Climate · "}
                  </span>
                  {weather.advice}
                </p>
              </div>
            </div>
            {climateNoteOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </button>

          {climateNoteOpen && (
            <div className="px-3.5 pb-3 pt-2 border-t border-border/80 space-y-2.5 animate-in fade-in duration-150 bg-muted/25">
              <p className="text-xs text-foreground leading-relaxed">
                {weather.advice}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingStylistPrompt(
                      `Plan an outfit for today's weather in ${shortCity} (${weather.temp}${weather.conditionLabel ? `, ${weather.conditionLabel}` : ""}).`,
                    );
                    setRequestedTab("generator");
                  }}
                  className="btn-shine ask-ai-gradient flex-1 min-h-[36px] px-3 rounded-xl text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#FFCB44] shrink-0" />
                  <span>Chat with Stylist about today&apos;s weather</span>
                </button>

                <button
                  type="button"
                  onClick={() => void refreshWeather()}
                  disabled={weatherAdviceLoading || weatherLocating}
                  className="w-9 h-9 rounded-xl border border-border bg-card text-muted-foreground hover:text-turquoise hover:border-turquoise/60 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
                  title="Refresh live weather and AI advice"
                  aria-label="Refresh weather advice"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      weatherAdviceLoading || weatherLocating ? "animate-spin" : ""
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. Today's Outfit Section */}
      <section className="space-y-3">
        {/* Editorial Underline Style Direction Tabs */}
        <div
          role="tablist"
          aria-label="Outfit style direction"
          className="flex items-center gap-4 overflow-x-auto no-scrollbar border-b border-border pb-0.5 px-0.5"
        >
          {Object.entries(outfits).map(([dirKey, o]) => {
            const active = selectedDirection === dirKey;
            const isDefaultPick = dirKey === defaultDirection;

            return (
              <div
                key={dirKey}
                className="relative flex items-center shrink-0 gap-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    if (active) {
                      handleRegenerate(
                        `Create a fresh variation for the ${o.label} style.`,
                        dirKey,
                      );
                      return;
                    }
                    setSelectedDirection(dirKey);
                    setCtrlMode("default");
                    setWornToday(false);
                    setTodayOutfitError("");
                  }}
                  disabled={loading}
                  className={`shrink-0 pb-2 pt-1 text-xs min-[380px]:text-[13px] transition-colors flex items-center gap-1 cursor-pointer border-b-2 -mb-[1px] ${
                    active
                      ? "font-bold text-foreground border-pink dark:border-[#FFCB44]"
                      : "font-medium text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                >
                  {user.accessibility.lowDecisionMode && isDefaultPick && (
                    <Zap className="w-3 h-3 text-gold shrink-0" />
                  )}
                  <span>{o.label}</span>
                  {o.isCustom && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase bg-muted text-muted-foreground">
                      Custom
                    </span>
                  )}
                </button>

                {o.isCustom && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCustomStyle(dirKey);
                    }}
                    aria-label={`Remove custom preset ${o.label}`}
                    className="mb-1.5 w-5 h-5 rounded-full hover:bg-red/15 text-muted-foreground hover:text-red flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    title={`Remove custom preset "${o.label}"`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setAddStyleModalOpen(true)}
            aria-label="Create custom style preset"
            className="shrink-0 pb-2 pt-1 text-xs font-semibold flex items-center gap-1 text-pink hover:opacity-80 transition-opacity cursor-pointer"
            title="Save a custom style preset"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Style</span>
          </button>
        </div>

        {/* Shimmer Loading Skeleton */}
        {loading && (
          <div
            role="status"
            aria-live="polite"
            className="lumina-card rounded-[20px] overflow-hidden"
          >
            <div className="h-[2.5px] lumina-strip" />
            <div className="p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-36 rounded-full shimmer-skeleton" />
                  <div className="h-3 w-52 rounded-full shimmer-skeleton" />
                </div>
                <div className="h-6 w-16 rounded-full shimmer-skeleton" />
              </div>

              <div className="divide-y divide-border">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="py-3 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl shimmer-skeleton shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-40 rounded-full shimmer-skeleton" />
                      <div className="h-2.5 w-24 rounded-full shimmer-skeleton" />
                    </div>
                    <div className="h-7 w-14 rounded-lg shimmer-skeleton shrink-0" />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <div className="h-10 flex-1 rounded-xl shimmer-skeleton" />
                <div className="h-10 w-10 rounded-xl shimmer-skeleton" />
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                Curating your outfit from weather, closet &amp; preferences…
              </p>
            </div>
          </div>
        )}

        {!loading && todayOutfitError && (
          <AIErrorBanner
            title="Could not load today's outfit"
            message={todayOutfitError}
            actions={[
              {
                label: "Try Again",
                primary: true,
                onClick: () => handleRegenerate(),
              },
            ]}
          />
        )}

        {/* Editorial Lumina Outfit Card with Flat-Lay Lookbook Strip & Swipe Cycling */}
        {!loading && todayOutfit && currentOutfit && (
          <div
            key={selectedDirection}
            onTouchStart={handleCardTouchStart}
            onTouchEnd={handleCardTouchEnd}
            className="tab-fade-enter lumina-card rounded-[20px] overflow-hidden transition-all"
          >
            <div aria-hidden="true" className="h-[2.5px] lumina-strip" />
            <div className="p-3.5 space-y-3">
              {/* Card Header with Quick-Cycle Arrows */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-editorial text-lg font-bold text-foreground leading-tight">
                      Today&apos;s Look
                    </h2>
                    {wornToday ? (
                      <span
                        role="status"
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green/12 text-green"
                      >
                        <Check className="w-3 h-3" strokeWidth={2.5} />
                        Worn
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFCB44]/22 text-gold dark:text-[#FFCB44]">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        Top Match
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug truncate">
                    {currentOutfit.tagline}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {directionKeys.length > 1 && (
                    <div className="inline-flex items-center rounded-full border border-border bg-muted/60 p-0.5">
                      <button
                        type="button"
                        onClick={() => cycleDirection(-1)}
                        aria-label="Previous style direction"
                        className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => cycleDirection(1)}
                        aria-label="Next style direction"
                        className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {showListen && (
                    <button
                      type="button"
                      onClick={handleToggleListen}
                      aria-pressed={speakingOutfit}
                      aria-label={
                        speakingOutfit
                          ? "Stop reading outfit aloud"
                          : "Listen to outfit summary read aloud"
                      }
                      className={`h-8 px-2 rounded-full flex items-center gap-1 text-[11px] font-semibold border transition-all cursor-pointer ${
                        speakingOutfit
                          ? "bg-pink text-white border-pink"
                          : "bg-muted/70 text-foreground border-border hover:border-turquoise"
                      }`}
                    >
                      {speakingOutfit ? (
                        <Square className="w-3 h-3 fill-current" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setOutfitFeedbackModalOpen(true)}
                    aria-label="Give feedback on this outfit"
                    title="Give feedback on this outfit"
                    className="w-8 h-8 rounded-full flex items-center justify-center border border-border bg-muted/60 text-muted-foreground hover:text-pink hover:border-pink/50 transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Visual Outfit Flat-Lay Collage Strip (core pieces + 1 consolidated Accessories tile) */}
              <div
                className={`grid gap-2 ${
                  coreEntries.length + 1 >= 4
                    ? "grid-cols-4"
                    : coreEntries.length + 1 === 3
                      ? "grid-cols-3"
                      : "grid-cols-2"
                }`}
              >
                {coreEntries.map(({ item, idx }) => {
                  const matchedItem = wardrobe.find(
                    (w) => w.name.toLowerCase() === item.desc.toLowerCase(),
                  );
                  const itemImg =
                    matchedItem?.imageData ||
                    getSampleGarmentImage(item.desc, item.type);
                  const displaySlot =
                    item.type.charAt(0).toUpperCase() + item.type.slice(1);

                  return (
                    <button
                      key={`flatlay-${item.type}-${idx}`}
                      type="button"
                      onClick={() => {
                        setSwapTargetIndex(idx);
                        setSwapModalOpen(true);
                      }}
                      aria-label={`Swap ${item.desc} (${displaySlot})`}
                      title={`Tap to swap ${item.desc}`}
                      className="group flex flex-col items-center gap-1 cursor-pointer focus:outline-none"
                    >
                      <div className="w-full h-[74px] rounded-xl bg-muted/65 p-1.5 border border-border/80 group-hover:border-turquoise transition-all flex items-center justify-center overflow-hidden relative">
                        {itemImg ? (
                          <img
                            src={itemImg}
                            alt={item.desc}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <span aria-hidden="true" className="text-2xl">
                            {getPieceEmoji(item.type)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground group-hover:text-turquoise transition-colors truncate max-w-full">
                        {displaySlot}
                      </span>
                    </button>
                  );
                })}

                {/* Consolidated Multi-Accessory Flat-Lay Tile */}
                {(() => {
                  const primaryAcc = accessoryEntries[0]?.item;
                  const matchedAcc = primaryAcc
                    ? wardrobe.find(
                        (w) => w.name.toLowerCase() === primaryAcc.desc.toLowerCase(),
                      )
                    : undefined;
                  const accImg = primaryAcc
                    ? matchedAcc?.imageData ||
                      getSampleGarmentImage(primaryAcc.desc, primaryAcc.type)
                    : undefined;
                  const extraCount = Math.max(0, accessoryEntries.length - 1);

                  return (
                    <button
                      type="button"
                      onClick={() => setAccessoriesSheetOpen(true)}
                      aria-label={
                        accessoryEntries.length > 0
                          ? `Manage ${accessoryEntries.length} accessories`
                          : "Add accessories to today's outfit"
                      }
                      className="group flex flex-col items-center gap-1 cursor-pointer focus:outline-none"
                    >
                      <div
                        className={`w-full h-[74px] rounded-xl p-1.5 border transition-all flex items-center justify-center overflow-hidden relative ${
                          primaryAcc
                            ? "bg-muted/65 border-border/80 group-hover:border-pink"
                            : "bg-muted/35 border-dashed border-border group-hover:border-pink/60"
                        }`}
                      >
                        {primaryAcc ? (
                          accImg ? (
                            <img
                              src={accImg}
                              alt={primaryAcc.desc}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <span aria-hidden="true" className="text-2xl">
                              {getPieceEmoji(primaryAcc.type)}
                            </span>
                          )
                        ) : (
                          <div className="flex flex-col items-center gap-0.5 text-muted-foreground group-hover:text-pink">
                            <Plus className="w-4 h-4" />
                            <span className="text-[9.5px] font-semibold">Add</span>
                          </div>
                        )}

                        {extraCount > 0 && (
                          <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-[#0F172A]/88 text-[#FFCB44] leading-none shadow-xs">
                            +{extraCount}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground group-hover:text-pink transition-colors truncate max-w-full">
                        {accessoryEntries.length > 1
                          ? `Acc (${accessoryEntries.length})`
                          : "Accessory"}
                      </span>
                    </button>
                  );
                })()}
              </div>

              {/* Ultra-Compact Hairline Garments Breakdown (core pieces + 1 clean Accessories row) */}
              <div className="divide-y divide-border border-y border-border">
                {coreEntries.map(({ item, idx }) => {
                  const readableColor = getReadableColorLabel(
                    item.color,
                    item.desc,
                    wardrobe,
                  );
                  const cleanColorName = readableColor
                    .replace(/\s*\(#[0-9a-fA-F]{3,8}\)/g, "")
                    .trim();
                  const displaySlot =
                    item.type.charAt(0).toUpperCase() + item.type.slice(1);
                  const matchedItem = wardrobe.find(
                    (w) => w.name.toLowerCase() === item.desc.toLowerCase(),
                  );
                  const selectionTags = getOutfitItemSelectionTags(
                    item,
                    matchedItem,
                    weather.temp,
                  );

                  return (
                    <div
                      key={`${item.type}-${idx}`}
                      className="flex items-center justify-between gap-2 py-1.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          aria-hidden="true"
                          className="w-2.5 h-2.5 rounded-full border border-foreground/20 shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold text-foreground leading-tight truncate">
                            {item.desc}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[10.5px] text-muted-foreground truncate">
                              {displaySlot} · {cleanColorName}
                            </span>
                            {selectionTags.slice(0, 1).map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded-md text-[9.5px] font-medium bg-muted text-muted-foreground leading-none"
                              >
                                {tag}
                              </span>
                            ))}
                            {user.accessibility.highContrastColors && (
                              <span className="bg-foreground text-background font-bold px-1.5 py-0.5 rounded-md text-[9.5px] leading-none">
                                {readableColor}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSwapTargetIndex(idx);
                          setSwapModalOpen(true);
                        }}
                        aria-label={`Swap ${item.desc} (${item.type})`}
                        className="h-7 px-2 rounded-lg text-[10.5px] font-semibold inline-flex items-center gap-1 text-turquoise bg-turquoise/8 hover:bg-turquoise/16 transition-colors shrink-0 cursor-pointer"
                        title={`Swap ${item.desc}`}
                      >
                        <ArrowLeftRight className="w-3 h-3" />
                        <span>Swap</span>
                      </button>
                    </div>
                  );
                })}

                {/* Single Consolidated Accessories Row (supports 0, 1, or many accessories cleanly) */}
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Sparkles className="w-3.5 h-3.5 text-gold shrink-0" strokeWidth={2} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-foreground leading-tight truncate">
                        {accessoryEntries.length === 0
                          ? "Add accessories"
                          : accessoryEntries.length === 1
                            ? accessoryEntries[0].item.desc
                            : `${accessoryEntries[0].item.desc} + ${accessoryEntries.length - 1} more`}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground truncate mt-0.5">
                        {accessoryEntries.length === 0
                          ? "Layer jewelry, bags, or accents"
                          : accessoryEntries.length === 1
                            ? "1 accessory · tap to add more"
                            : accessoryEntries.map((a) => a.item.desc).join(" · ")}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAccessoriesSheetOpen(true)}
                    aria-label="Manage accessories for today's outfit"
                    className="h-7 px-2.5 rounded-lg text-[10.5px] font-semibold inline-flex items-center gap-1 text-pink bg-pink/10 hover:bg-pink/18 transition-colors shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{accessoryEntries.length > 0 ? "Edit" : "Add"}</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Why it works disclosure */}
              <WhyItWorksDisclosure
                rationale={currentOutfit.rationale}
                onDeepDive={() => setWhyModalOpen(true)}
              />

              {/* Primary Action Controls */}
              <UserControlBar
                mode={ctrlMode}
                approveLabel={wornToday ? "Wearing Now" : "Wear This Outfit"}
                onApprove={handleApprove}
                onReject={() => setRejectModalOpen(true)}
                onRegenerate={() => handleRegenerate()}
                onFavorite={() =>
                  toggleFavoriteOutfit(
                    String(currentOutfit.id || currentOutfit.label),
                  )
                }
                isFavorite={favoriteOutfitIds.includes(
                  String(currentOutfit.id || currentOutfit.label),
                )}
                onTryOn={openTryOnForCurrentOutfit}
              />

              {/* Post-Approve Laundry Prompt */}
              {wornToday && (
                <div className="rounded-xl p-3 flex items-center justify-between gap-2 animate-in fade-in duration-200 bg-green/10 border border-green/35">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green shrink-0" />
                    <span>Logged for today! Move worn items to hamper?</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      sendOutfitToLaundry(currentOutfit.items.map((i) => i.desc));
                    }}
                    className="px-3 min-h-[34px] rounded-xl text-xs font-semibold text-white shrink-0 bg-dark-teal hover:brightness-110 transition-all inline-flex items-center gap-1 cursor-pointer"
                  >
                    <WashingMachine className="w-3.5 h-3.5" />
                    <span>Hamper</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 3. Recent Looks Wear History */}
      {user.accessibility.lowDecisionMode && !showRecentHistory ? (
        <button
          type="button"
          onClick={() => setShowRecentHistory(true)}
          aria-expanded={false}
          className="lumina-card w-full min-h-[44px] py-2.5 px-4 rounded-2xl text-xs font-semibold text-foreground hover:border-turquoise/60 flex items-center justify-between transition-all cursor-pointer"
        >
          <span className="inline-flex items-center gap-2">
            <Calendar className="w-4 h-4 text-turquoise" />
            <span>Recent Looks ({recentLooks.length})</span>
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      ) : (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h3 className="font-editorial text-base font-bold text-foreground">
              Recent Looks
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-medium text-muted-foreground">
                {recentLooks.length} saved
              </span>
              {user.accessibility.lowDecisionMode && (
                <button
                  type="button"
                  onClick={() => setShowRecentHistory(false)}
                  aria-expanded={true}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Hide
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 min-[350px]:grid-cols-2 gap-2.5">
            {recentLooks.slice(0, 6).map((r) => (
              <div
                key={r.id}
                className="lumina-card rounded-2xl overflow-hidden flex flex-col"
              >
                <div
                  className="h-1.5 w-full"
                  style={{ background: r.color }}
                />
                <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-bold text-foreground leading-tight">
                      {r.day}
                    </p>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {r.date}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {r.items.slice(0, 3).map((item) => (
                      <li
                        key={item}
                        className="text-[11px] text-muted-foreground leading-snug truncate"
                      >
                        · {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Deep-Dive "Why this outfit?" Bottom Sheet */}
      <BottomSheet
        open={Boolean(whyModalOpen && currentOutfit)}
        onClose={() => setWhyModalOpen(false)}
        title="Why This Outfit Works"
        subtitle={currentOutfit?.label}
        icon={<Lightbulb className="w-4 h-4 text-gold" />}
        titleId="home-why-modal-title"
        footer={
          <button
            type="button"
            onClick={() => setWhyModalOpen(false)}
            className="btn-shine btn-lumina-primary w-full min-h-[42px] rounded-xl text-xs font-bold cursor-pointer"
          >
            Got It
          </button>
        }
      >
        {currentOutfit && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-turquoise inline-flex items-center gap-1.5">
                <CloudSun className="w-3.5 h-3.5" />
                Weather Fit ({weather.temp})
              </span>
              <p className="text-xs text-foreground leading-relaxed">
                {currentOutfit.whyDetails?.weatherReason ||
                  "Matched to today's temperature."}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-pink inline-flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                Color Harmony
              </span>
              <p className="text-xs text-foreground leading-relaxed">
                {currentOutfit.whyDetails?.colorHarmony ||
                  "High contrast balanced palette."}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-green inline-flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Closet Rotation
              </span>
              <p className="text-xs text-foreground leading-relaxed">
                {currentOutfit.whyDetails?.wearFrequency ||
                  "Keeps your closet rotation fresh."}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gold inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Comfort &amp; Piece Notes
              </span>
              <p className="text-xs text-foreground leading-relaxed">
                {currentOutfit.whyDetails?.sensoryComfort ||
                  "Breathable, comfortable fabrics."}
              </p>
              <ul className="pt-1.5 space-y-1 border-t border-border">
                {currentOutfit.items.map((item, i) => (
                  <li
                    key={`${item.desc}-${i}`}
                    className="text-[11px] text-muted-foreground"
                  >
                    <strong className="text-foreground">{item.type}:</strong>{" "}
                    {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Reject Reason Bottom Sheet */}
      <BottomSheet
        open={rejectModalOpen}
        onClose={() => {
          setRejectModalOpen(false);
          setCustomRejectReason("");
        }}
        title="What Would You Change?"
        subtitle="We'll immediately restyle around your note"
        icon={<RefreshCw className="w-4 h-4 text-pink" />}
        titleId="home-reject-modal-title"
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRejectModalOpen(false);
                setCustomRejectReason("");
                handleRegenerate();
              }}
              className="flex-1 min-h-[42px] rounded-xl text-xs font-semibold border border-border bg-muted text-foreground cursor-pointer"
            >
              Just Shuffle
            </button>
            <button
              type="button"
              disabled={!customRejectReason.trim()}
              onClick={() => {
                const note = customRejectReason.trim();
                setRejectModalOpen(false);
                setCustomRejectReason("");
                handleRegenerate(note);
              }}
              className="btn-shine btn-lumina-primary flex-1 min-h-[42px] rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              Update Look
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              "Too formal",
              "Too casual",
              "Wrong weather",
              "Colors clash",
              "No outerwear",
              "Uncomfortable fit",
            ].map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => {
                  setRejectModalOpen(false);
                  setCustomRejectReason("");
                  handleRegenerate(reason);
                }}
                className="p-2.5 min-h-[42px] rounded-xl text-xs font-semibold text-left border border-border bg-muted/60 hover:border-pink/60 transition-all text-foreground cursor-pointer"
              >
                {reason}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-border">
            <label
              htmlFor="home-custom-reject-reason"
              className="text-xs font-semibold text-foreground block"
            >
              Or describe what you prefer
            </label>
            <textarea
              id="home-custom-reject-reason"
              rows={2}
              value={customRejectReason}
              onChange={(e) => setCustomRejectReason(e.target.value)}
              placeholder="e.g. Prefer black shoes, or warmer layer…"
              className="w-full rounded-xl p-3 text-xs outline-none bg-muted/60 text-foreground border border-border focus:border-pink resize-none"
            />
          </div>
        </div>
      </BottomSheet>

      {/* Garment Swap Bottom Sheet */}
      <BottomSheet
        open={Boolean(swapModalOpen && swapTargetIndex !== null)}
        onClose={() => setSwapModalOpen(false)}
        title={`Swap ${swapTargetIndex !== null ? currentOutfit.items[swapTargetIndex]?.type || "Item" : "Item"}`}
        subtitle="Choose another piece from your closet"
        icon={<ArrowLeftRight className="w-4 h-4 text-turquoise" />}
        titleId="home-swap-modal-title"
      >
        {swapTargetIndex !== null && (
          <div className="divide-y divide-border">
            {wardrobe
              .filter((item) =>
                swapMatchesCategory(
                  currentOutfit.items[swapTargetIndex]?.type || "",
                  item.category,
                ),
              )
              .map((wItem) => (
                <button
                  key={wItem.id}
                  type="button"
                  onClick={() => handleSwapItem(wItem)}
                  className="w-full py-2.5 px-1 flex items-center gap-3 text-left hover:bg-muted/50 rounded-xl transition-colors cursor-pointer"
                >
                  {wItem.imageData ? (
                    <img
                      src={wItem.imageData}
                      alt={wItem.name}
                      className="w-11 h-11 rounded-xl object-contain bg-muted/70 p-0.5 border border-border shrink-0"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-11 h-11 rounded-xl flex items-center justify-center border border-border text-lg shrink-0"
                      style={{ background: `${wItem.color}22` }}
                    >
                      {getPieceEmoji(wItem.category)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {wItem.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {wItem.colorName}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-turquoise/12 text-turquoise shrink-0">
                    Pick
                  </span>
                </button>
              ))}
          </div>
        )}
      </BottomSheet>

      {/* Multi-Select Accessories Bottom Sheet */}
      <BottomSheet
        open={accessoriesSheetOpen}
        onClose={() => setAccessoriesSheetOpen(false)}
        title="Accessories"
        subtitle={
          accessoryEntries.length === 0
            ? "Select one or more pieces to layer onto today's look"
            : `${accessoryEntries.length} selected for today's look`
        }
        icon={<Sparkles className="w-4 h-4 text-gold" />}
        titleId="home-accessories-sheet-title"
        footer={
          <button
            type="button"
            onClick={() => setAccessoriesSheetOpen(false)}
            className="btn-shine btn-lumina-primary w-full min-h-[42px] rounded-xl text-xs font-bold cursor-pointer"
          >
            Done ({accessoryEntries.length} selected)
          </button>
        }
      >
        {wardrobeAccessories.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-xs font-semibold text-foreground">
              No accessories in your closet yet
            </p>
            <p className="text-[11px] text-muted-foreground">
              Add jewelry, bags, scarves, or watches in your Closet tab to layer them here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {wardrobeAccessories.map((acc) => {
              const selected = isAccessoryWorn(acc);
              return (
                <button
                  key={acc.id}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => toggleOutfitAccessory(acc)}
                  className="w-full py-2.5 px-1 flex items-center gap-3 text-left hover:bg-muted/40 rounded-xl transition-colors cursor-pointer"
                >
                  {acc.imageData ? (
                    <div className="w-11 h-11 rounded-xl bg-muted/65 p-1 border border-border shrink-0 flex items-center justify-center overflow-hidden">
                      <img
                        src={acc.imageData}
                        alt={acc.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-11 h-11 rounded-xl flex items-center justify-center border border-border text-lg shrink-0"
                      style={{ background: `${acc.color}22` }}
                    >
                      {getPieceEmoji(acc.category, acc.name)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {acc.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {acc.colorName}
                      {acc.material ? ` · ${acc.material}` : ""}
                    </p>
                  </div>

                  <span
                    aria-hidden="true"
                    className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all shrink-0 ${
                      selected
                        ? "bg-pink border-pink text-white shadow-xs"
                        : "bg-card border-border text-transparent"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </BottomSheet>

      {/* Add Custom Style Recommendation Modal */}
      <AddStyleModal
        isOpen={addStyleModalOpen}
        onClose={() => setAddStyleModalOpen(false)}
      />

      {/* Outfit Feedback Modal */}
      {currentOutfit && (
        <OutfitFeedbackModal
          isOpen={outfitFeedbackModalOpen}
          onClose={() => setOutfitFeedbackModalOpen(false)}
          outfitLabel={currentOutfit.label}
          onSaveFeedback={(notes, reasons) => {
            saveOutfitFeedback(
              String(currentOutfit.id || currentOutfit.label),
              notes,
              reasons,
            );
          }}
          onRegenerateWithFeedback={(notes, reasons) => {
            const combined = [notes, ...reasons].filter(Boolean).join(", ");
            handleRegenerate(combined || undefined);
          }}
        />
      )}

      {/* Garment Item Feedback Modal */}
      {garmentFeedbackTarget && (
        <GarmentFeedbackModal
          isOpen={Boolean(garmentFeedbackTarget)}
          onClose={() => setGarmentFeedbackTarget(null)}
          garmentDesc={garmentFeedbackTarget.item.desc}
          garmentType={garmentFeedbackTarget.item.type}
          garmentColor={garmentFeedbackTarget.item.color}
          onSaveFeedback={(notes, reasons) => {
            saveGarmentFeedback(
              `${currentOutfit?.label || "outfit"}-${garmentFeedbackTarget.item.desc}`,
              notes,
              reasons,
            );
          }}
          onSwapWithFeedback={(notes, reasons) => {
            saveGarmentFeedback(
              `${currentOutfit?.label || "outfit"}-${garmentFeedbackTarget.item.desc}`,
              notes,
              reasons,
            );
            setSwapTargetIndex(garmentFeedbackTarget.index);
            setSwapModalOpen(true);
          }}
        />
      )}
    </div>
  );
}
