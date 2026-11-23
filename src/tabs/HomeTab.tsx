import { useEffect, useRef, useState } from "react";
import {
  AnimatedStepProgress,
  UserControlBar,
  WhyItWorksDisclosure,
  OutfitFeedbackModal,
  GarmentFeedbackModal,
  type ControlMode,
} from "../components/AIComponents";
import { AddStyleModal } from "../components/AddStyleModal";
import CalendarPanel from "../components/CalendarPanel";
import { useApp } from "../context/AppContext";
import { getSampleGarmentImage } from "../data/personaData";
import {
  getGarmentEmoji,
  swapMatchesCategory,
} from "../lib/garmentCategories";
import {
  getOutfitItemSelectionTags,
  getReadableColorLabel,
  speakText,
  stopSpeaking,
} from "../services/accessibilityHelpers";
import {
  searchCities,
  type CitySearchResult,
} from "../services/weatherService";
import type { OutfitItem } from "../types";
import { THEME_COLORS } from "../types/theme";

function locationSourceLabel(
  source: string | null | undefined,
): string {
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

const GENERATION_STEPS = [
  "Reading digital wardrobe & local forecast…",
  "Analyzing wear history & color theory rules…",
  "Synthesizing accessible outfit options…",
  "Finalizing personalized stylist notes…",
];

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
    wornToday,
    setWornToday,
    regenerateOutfit,
    swapOutfitItem,
    weather,
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
  } = useApp();

  const [loading, setLoading] = useState(false);
  const [ctrlMode, setCtrlMode] = useState<ControlMode>("default");
  const [whyModalOpen, setWhyModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [customRejectReason, setCustomRejectReason] = useState("");
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapTargetIndex, setSwapTargetIndex] = useState<number | null>(null);
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
  const [showCitySearch, setShowCitySearch] = useState(false);
  const citySearchTimerRef = useRef<number | null>(null);

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
  const liveDateLabel = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: clockTimeZone,
  });
  const liveTimeLabel = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
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

  const handleRegenerate = (reasonConstraint?: string) => {
    setLoading(true);
    setCtrlMode("regenerating");
    setTimeout(() => {
      regenerateOutfit(reasonConstraint);
      setLoading(false);
      setCtrlMode("default");
    }, 650);
  };

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

  return (
    <div className="pt-1 pb-4 space-y-3">
      {/* 1. Date, Greeting & Weather Card */}
      <div
        className="rounded-2xl p-3 pt-3.5 space-y-2 shadow-sm border-2 relative overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-pink via-gold to-turquoise"
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] min-[380px]:text-xs font-extrabold uppercase tracking-wider text-muted-foreground leading-snug">
              {liveDateLabel}
            </p>
            <h1
              className="text-xl min-[390px]:text-2xl font-black tracking-tight leading-tight text-foreground"
              style={{ fontFamily: "Nunito, sans-serif" }}
            >
              Hi, {user.name.split(" ")[0]}
            </h1>
            <p
              className="mt-0.5 text-sm font-black tabular-nums text-foreground leading-tight"
              aria-live="polite"
              aria-atomic="true"
              title={`Local time · ${clockTimeZone}`}
            >
              {liveTimeLabel}
              <span className="ml-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                live
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refreshWeather()}
            disabled={weatherLocating}
            aria-label={`Weather in ${weather.city}: ${weather.temp}. Tap to refresh live weather.`}
            className="flex items-center gap-2 px-3 py-1.5 min-h-[42px] rounded-xl border-2 border-border bg-muted transition-transform active:scale-95 shrink-0 hover:border-turquoise cursor-pointer disabled:opacity-60"
            title="Tap to refresh live weather"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {weather.icon}
            </span>
            <div className="text-right min-w-0">
              <p className="text-sm font-black leading-tight text-foreground whitespace-nowrap">
                {weather.temp}
              </p>
              <p className="text-[11px] font-bold leading-tight text-muted-foreground whitespace-nowrap max-w-[9.5rem] truncate">
                {weather.city}
              </p>
            </div>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
            {locationSourceLabel(weatherLocationSource || weather.locationSource)}
          </span>
          <button
            type="button"
            onClick={() => void useCurrentLocationWeather()}
            disabled={weatherLocating}
            className="min-h-[32px] px-2.5 rounded-full text-[11px] font-extrabold border-2 border-turquoise bg-turquoise/10 text-foreground cursor-pointer disabled:opacity-50"
          >
            {weatherLocating && weatherLocationSource !== "city"
              ? "Locating…"
              : "Use my location"}
          </button>
          <button
            type="button"
            onClick={() => setShowCitySearch((open) => !open)}
            aria-expanded={showCitySearch}
            className="min-h-[32px] px-2.5 rounded-full text-[11px] font-extrabold border-2 border-border bg-muted text-foreground cursor-pointer"
          >
            {showCitySearch ? "Hide city search" : "Search city"}
          </button>
        </div>

        {showCitySearch && (
          <div className="space-y-1.5 rounded-xl border-2 border-border bg-muted/40 p-2">
            <label htmlFor="home-city-search" className="sr-only">
              Search city for weather
            </label>
            <input
              id="home-city-search"
              type="search"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="Type a city (e.g. New Orleans)"
              className="w-full min-h-[40px] rounded-lg border-2 border-border bg-card px-3 text-sm font-semibold text-foreground outline-none focus:border-turquoise"
            />
            <p className="text-[11px] font-semibold text-muted-foreground leading-snug">
              {citySearching
                ? "Searching…"
                : "If location is denied, pick a city. We also remember your last place."}
            </p>
            {cityResults.length > 0 && (
              <ul className="space-y-1" role="listbox" aria-label="City search results">
                {cityResults.map((result) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      role="option"
                      onClick={() => {
                        void setWeatherCity(result).then(() => {
                          setShowCitySearch(false);
                          setCityQuery("");
                          setCityResults([]);
                        });
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg text-xs font-extrabold border-2 border-border bg-card text-foreground hover:border-turquoise cursor-pointer"
                    >
                      {result.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* AI Climate Tip */}
        <div className="rounded-xl px-3 py-2 flex items-center justify-between text-xs bg-turquoise/10 border-2 border-turquoise/45">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
              className="text-sm shrink-0 text-turquoise font-bold"
            >
              ✦
            </span>
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-turquoise">
                  {weatherAdviceLoading
                    ? "Asking local AI…"
                    : weather.adviceSource === "ai"
                      ? "AI Climate Tip"
                      : "Climate Tip"}
                </span>
                {weather.adviceSource === "ai" && !weatherAdviceLoading && (
                  <span className="text-[10px] font-bold text-muted-foreground">
                    · Tailored to your preferences
                  </span>
                )}
              </div>
              <p className="text-xs min-[380px]:text-[13px] font-semibold text-foreground leading-snug">
                {weather.advice}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshWeather()}
            disabled={weatherAdviceLoading || weatherLocating}
            className="text-xs font-black text-foreground hover:text-pink shrink-0 ml-2 w-8 h-8 rounded-lg border-2 border-border bg-card flex items-center justify-center cursor-pointer disabled:opacity-60"
            title="Refresh live weather and AI advice"
            aria-label="Refresh weather advice"
          >
            <span
              aria-hidden="true"
              className={
                weatherAdviceLoading || weatherLocating
                  ? "inline-block animate-spin"
                  : ""
              }
            >
              ↻
            </span>
          </button>
        </div>
      </div>

      {/* Calendar: ICS events + outfit wear history (list / week / month) */}
      <CalendarPanel />

      {/* 2. Today's Outfit Header & Style Pills */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2
            className="text-lg min-[390px]:text-xl font-black leading-tight text-foreground"
            style={{ fontFamily: "Nunito, sans-serif" }}
          >
            Today&apos;s outfit
          </h2>

          <div className="flex items-center gap-1.5 shrink-0">
            {user.accessibility.lowDecisionMode && (
              <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full text-foreground border-2 border-turquoise bg-turquoise/15">
                ⚡ Top Match
              </span>
            )}
            {wornToday && (
              <span
                role="status"
                className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider text-green border-2 border-green bg-green/10"
              >
                <span aria-hidden="true">✓ </span>Worn
              </span>
            )}
          </div>
        </div>

        {/* Horizontal Scrollable Style Direction Pills */}
        <div
          role="tablist"
          aria-label="Outfit style direction"
          className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5 items-center"
        >
          {Object.entries(outfits).map(([dirKey, o]) => {
            const active = selectedDirection === dirKey;
            const isDefaultPick = dirKey === defaultDirection;

            return (
              <div
                key={dirKey}
                className="relative group flex items-center shrink-0"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setSelectedDirection(dirKey);
                    setCtrlMode("default");
                    setWornToday(false);
                  }}
                  className={`shrink-0 min-h-[38px] py-1.5 px-3 rounded-xl text-xs min-[380px]:text-[13px] font-extrabold tracking-wide transition-all duration-200 flex items-center gap-1 cursor-pointer border-2 ${
                    active
                      ? "bg-pink text-white border-[#0D0F18]/20 dark:border-white/30 shadow-md shadow-pink/25"
                      : "bg-card text-foreground border-border hover:border-pink"
                  }`}
                >
                  {user.accessibility.lowDecisionMode && isDefaultPick && (
                    <span
                      aria-hidden="true"
                      className="text-[11px] leading-none"
                      title="AI Primary Recommendation"
                    >
                      ⚡
                    </span>
                  )}
                  <span>{o.label}</span>
                  {o.isCustom && (
                    <span className="text-[10px] px-1 rounded font-bold uppercase ml-0.5 opacity-90 bg-black/20">
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
                    className="ml-1 w-7 h-7 rounded-full bg-muted hover:bg-red/20 text-foreground hover:text-red flex items-center justify-center text-xs font-bold transition-colors cursor-pointer border-2 border-border shrink-0"
                    title={`Remove custom preset "${o.label}"`}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setAddStyleModalOpen(true)}
            aria-label="Create custom style preset"
            className="shrink-0 min-h-[38px] py-1.5 px-3 rounded-xl text-xs font-extrabold tracking-wide flex items-center gap-1 border-2 border-dashed border-border text-foreground hover:border-pink hover:bg-pink/5 transition-all duration-200 cursor-pointer"
            title="Save a custom style preset"
          >
            <span
              aria-hidden="true"
              className="text-sm leading-none font-black text-pink"
            >
              +
            </span>
            <span>Style</span>
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div
            className="rounded-2xl p-4 space-y-2.5 border-2 shadow-sm"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
            }}
          >
            <p className="text-xs font-bold text-foreground">
              Building your look…
            </p>
            <AnimatedStepProgress
              steps={GENERATION_STEPS}
              intervalMs={500}
              onComplete={() => setLoading(false)}
            />
          </div>
        )}

        {/* Main Outfit Card */}
        {!loading && currentOutfit && (
          <div
            className="rounded-2xl p-3 space-y-2.5 shadow-md border-2 transition-all"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm min-[380px]:text-[15px] font-black text-foreground leading-snug">
                    {currentOutfit.tagline}
                  </p>
                  <div
                    role="img"
                    aria-label={`Outfit palette: ${currentOutfit.items
                      .map((i) =>
                        getReadableColorLabel(i.color, i.desc, wardrobe),
                      )
                      .join(", ")}`}
                    title={`Palette: ${currentOutfit.items
                      .map((i) =>
                        getReadableColorLabel(i.color, i.desc, wardrobe),
                      )
                      .join(" · ")}`}
                    className="inline-flex items-center p-1 rounded-full bg-muted border border-border shrink-0"
                  >
                    <div className="flex items-center -space-x-1">
                      {currentOutfit.items.map((item, cIdx) => (
                        <span
                          key={`${item.desc}-${cIdx}`}
                          className="w-4 h-4 rounded-full border border-card shadow-2xs"
                          style={{ backgroundColor: item.color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
               
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
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
                    className={`text-xs font-extrabold px-3 min-h-[44px] min-w-[44px] rounded-full flex items-center gap-1.5 transition-all border-2 shrink-0 cursor-pointer ${
                      speakingOutfit
                        ? "bg-pink text-white border-pink shadow-xs"
                        : user.accessibility.voiceNarration
                          ? "bg-turquoise text-[#0D0F18] border-[#0D0F18]/25 shadow-xs"
                          : "bg-muted text-foreground border-border hover:border-turquoise"
                    }`}
                  >
                    <span aria-hidden="true">
                      {speakingOutfit ? "⏹" : "🔊"}
                    </span>
                    <span>{speakingOutfit ? "Stop" : "Listen"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setOutfitFeedbackModalOpen(true)}
                  aria-label="Notes on why outfit doesn't work"
                  className="text-xs font-extrabold px-3 min-h-[44px] rounded-full flex items-center gap-1 border-2 bg-muted text-foreground border-border hover:border-pink transition-colors shrink-0 cursor-pointer"
                  title="Give feedback on why this outfit doesn't work"
                >
                  <span aria-hidden="true">💬</span>
                  <span>Feedback</span>
                </button>
              </div>
            </div>

            {/* Garments List */}
            <div className="space-y-2">
              {currentOutfit.items.map((item, idx) => {
                const readableColor = getReadableColorLabel(
                  item.color,
                  item.desc,
                  wardrobe,
                );
                const matchedItem = wardrobe.find(
                  (w) => w.name.toLowerCase() === item.desc.toLowerCase(),
                );
                const itemImg =
                  matchedItem?.imageData ||
                  getSampleGarmentImage(item.desc, item.type);
                const selectionTags = getOutfitItemSelectionTags(
                  item,
                  matchedItem,
                  weather.temp,
                );

                return (
                  <div
                    key={`${item.type}-${idx}`}
                    className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-card border-2 border-border shadow-2xs transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {itemImg ? (
                        <img
                          src={itemImg}
                          alt={item.desc}
                          className="w-11 h-11 rounded-xl object-contain bg-[#F6F5F9] p-0.5 border border-border shrink-0"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="w-11 h-11 rounded-xl flex items-center justify-center border border-border text-lg shrink-0"
                          style={{ background: `${item.color}1E` }}
                        >
                          {getPieceEmoji(item.type)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-extrabold text-foreground leading-snug">
                          {item.desc}
                        </p>
                        <div className="flex items-center gap-1 flex-wrap mt-1">
                          {selectionTags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground border border-border leading-tight"
                            >
                              {tag}
                            </span>
                          ))}
                          {user.accessibility.highContrastColors && (
                            <span className="bg-foreground text-background font-extrabold px-2 py-0.5 rounded-md text-[10px] leading-tight">
                              {readableColor}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSwapTargetIndex(idx);
                          setSwapModalOpen(true);
                        }}
                        aria-label={`Swap ${item.desc} (${item.type})`}
                        className="px-3 min-h-[40px] rounded-xl text-xs font-extrabold transition-transform active:scale-95 bg-turquoise/15 text-foreground border-2 border-turquoise hover:bg-turquoise/25 cursor-pointer"
                        title={`Swap ${item.desc}`}
                      >
                        Swap ↺
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setGarmentFeedbackTarget({ item, index: idx })
                        }
                        aria-label={`Feedback for ${item.desc}`}
                        title={`Give feedback on ${item.desc}`}
                        className="w-10 h-10 rounded-xl text-xs font-extrabold flex items-center justify-center transition-transform active:scale-95 bg-muted text-foreground border-2 border-border hover:border-pink hover:text-pink cursor-pointer"
                      >
                        <span aria-hidden="true">💬</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Collapsible Why it works dropdown disclosure */}
            <WhyItWorksDisclosure
              rationale={currentOutfit.rationale}
              onDeepDive={() => setWhyModalOpen(true)}
            />

            {/* Control Bar */}
            <UserControlBar
              mode={ctrlMode}
              approveLabel={wornToday ? "✓ Wearing Now" : "Wear This Now"}
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
            />

            {/* Post-Approve Laundry Prompt */}
            {wornToday && (
              <div className="rounded-xl p-2.5 flex items-center justify-between gap-2 animate-in fade-in duration-200 bg-green/10 border-2 border-green/50">
                <p className="text-xs font-extrabold text-foreground">
                  ✓ Saved for today! Ready to launder yesterday&apos;s?
                </p>
                <button
                  type="button"
                  onClick={() => {
                    sendOutfitToLaundry(currentOutfit.items.map((i) => i.desc));
                  }}
                  className="px-3 min-h-[38px] rounded-xl text-xs font-extrabold text-white shrink-0 bg-dark-teal border-2 border-[#0D0F18]/20 hover:brightness-110 transition-all shadow-sm cursor-pointer"
                >
                  Hamper
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Recent Looks Wear History (collapsed by default in Low-Decision Mode) */}
      {user.accessibility.lowDecisionMode && !showRecentHistory ? (
        <button
          type="button"
          onClick={() => setShowRecentHistory(true)}
          aria-expanded={false}
          className="w-full min-h-[44px] py-2.5 px-3 rounded-2xl text-xs font-extrabold border-2 border-border bg-card text-foreground hover:border-turquoise flex items-center justify-between transition-all shadow-sm cursor-pointer"
        >
          <span>
            <span aria-hidden="true">📅 </span>
            Recent Looks ({recentLooks.length})
          </span>
        </button>
      ) : (
        <div
          className="rounded-2xl p-3 space-y-2.5 shadow-sm border-2"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <h3
              className="text-base font-black text-foreground"
              style={{ fontFamily: "Nunito, sans-serif" }}
            >
              Recent looks
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-extrabold text-muted-foreground">
                {recentLooks.length} saved
              </span>
              {user.accessibility.lowDecisionMode && (
                <button
                  type="button"
                  onClick={() => setShowRecentHistory(false)}
                  aria-expanded={true}
                  className="text-xs font-extrabold px-2.5 py-1 min-h-[32px] rounded-lg border-2 border-border bg-muted text-foreground hover:border-turquoise cursor-pointer"
                >
                  Hide
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 min-[350px]:grid-cols-2 gap-2">
            {recentLooks.slice(0, 6).map((r) => (
              <div
                key={r.id}
                className="rounded-2xl overflow-hidden flex flex-col border-2 border-border bg-muted shadow-sm"
              >
                <div
                  className="h-7 w-full relative px-2 py-1 flex items-center justify-between border-b-2 border-border"
                  style={{ background: r.color }}
                >
                  <span className="text-[11px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-black/85 text-white leading-none">
                    {r.date}
                  </span>
                </div>
                <div className="p-2.5 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-extrabold text-foreground leading-tight">
                      {r.day}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {r.items.slice(0, 3).map((item) => (
                        <li
                          key={item}
                          className="text-[11px] font-medium text-muted-foreground leading-snug"
                        >
                          · {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deep-Dive "Why this outfit?" Modal */}
      {whyModalOpen && currentOutfit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setWhyModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-why-modal-title"
            className="rounded-3xl p-4 sm:p-5 max-w-sm w-full max-h-[88dvh] overflow-y-auto space-y-3 shadow-2xl border-2"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-border pb-2.5">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-xl">
                  💡
                </span>
                <h3
                  id="home-why-modal-title"
                  className="text-base font-black text-foreground"
                >
                  Why this outfit works
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setWhyModalOpen(false)}
                aria-label="Close outfit details"
                className="w-9 h-9 rounded-xl border-2 border-border bg-muted text-foreground font-bold flex items-center justify-center cursor-pointer"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div className="space-y-2">
              <div className="p-3 rounded-2xl bg-muted border-2 border-border space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-turquoise">
                  ⛅ Weather Fit ({weather.temp})
                </span>
                <p className="text-xs font-medium text-foreground">
                  {currentOutfit.whyDetails?.weatherReason ||
                    "Matched to today's temperature."}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-muted border-2 border-border space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-pink">
                  🎨 Color Harmony
                </span>
                <p className="text-xs font-medium text-foreground">
                  {currentOutfit.whyDetails?.colorHarmony ||
                    "High contrast balanced palette."}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-muted border-2 border-border space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-green">
                  🔄 Closet Rotation
                </span>
                <p className="text-xs font-medium text-foreground">
                  {currentOutfit.whyDetails?.wearFrequency ||
                    "Keeps your closet rotation fresh."}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-muted border-2 border-border space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-foreground">
                  🧵 Comfort &amp; Piece Notes
                </span>
                <p className="text-xs font-medium text-foreground">
                  {currentOutfit.whyDetails?.sensoryComfort ||
                    "Breathable, comfortable fabrics."}
                </p>
                <ul className="pt-1 space-y-1 border-t border-border">
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

            <button
              type="button"
              onClick={() => setWhyModalOpen(false)}
              className="w-full min-h-[44px] py-2.5 rounded-xl text-sm font-black text-white transition-colors bg-pink border-2 border-[#0D0F18]/20 hover:brightness-110 shadow-md cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Reject Reason Modal with Custom Feedback Input */}
      {rejectModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => {
            setRejectModalOpen(false);
            setCustomRejectReason("");
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-reject-modal-title"
            className="rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl border-2"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3
                id="home-reject-modal-title"
                className="text-base font-black text-foreground"
              >
                What would you change?
              </h3>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                aria-label="Close feedback dialog"
                className="w-9 h-9 rounded-xl border-2 border-border bg-muted text-foreground font-bold flex items-center justify-center cursor-pointer"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

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
                  className="p-2.5 min-h-[42px] rounded-xl text-xs font-extrabold text-left border-2 border-border bg-muted hover:border-pink transition-all text-foreground cursor-pointer"
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="space-y-2 pt-2 border-t-2 border-border">
              <label
                htmlFor="home-custom-reject-reason"
                className="text-xs font-extrabold text-foreground block"
              >
                Or tell us what you want
              </label>
              <textarea
                id="home-custom-reject-reason"
                rows={2}
                value={customRejectReason}
                onChange={(e) => setCustomRejectReason(e.target.value)}
                placeholder="e.g. Prefer black shoes, or warmer layer…"
                className="w-full rounded-xl p-2.5 text-sm outline-none bg-muted text-foreground border-2 border-border focus:border-pink resize-none"
              />
              <button
                type="button"
                disabled={!customRejectReason.trim()}
                onClick={() => {
                  const note = customRejectReason.trim();
                  setRejectModalOpen(false);
                  setCustomRejectReason("");
                  handleRegenerate(note);
                }}
                className="w-full min-h-[44px] py-2.5 rounded-xl text-sm font-black text-white bg-pink border-2 border-[#0D0F18]/20 hover:brightness-110 disabled:opacity-40 transition-all shadow-md cursor-pointer"
              >
                Update Look
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setRejectModalOpen(false);
                setCustomRejectReason("");
                handleRegenerate();
              }}
              className="w-full min-h-[40px] py-1.5 rounded-xl text-xs font-extrabold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Garment Swap Modal */}
      {swapModalOpen && swapTargetIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSwapModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-swap-modal-title"
            className="rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl border-2"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3
                id="home-swap-modal-title"
                className="text-base font-black text-foreground"
              >
                Swap {currentOutfit.items[swapTargetIndex]?.type}
              </h3>
              <button
                type="button"
                onClick={() => setSwapModalOpen(false)}
                aria-label="Close garment swap dialog"
                className="w-9 h-9 rounded-xl border-2 border-border bg-muted text-foreground font-bold flex items-center justify-center cursor-pointer"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
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
                    className="w-full min-h-[48px] p-2.5 rounded-xl flex items-center gap-3 border-2 border-border bg-muted text-left hover:border-turquoise transition-all cursor-pointer"
                  >
                    {wItem.imageData ? (
                      <img
                        src={wItem.imageData}
                        alt={wItem.name}
                        className="w-10 h-10 rounded-xl object-contain bg-card border border-border shrink-0"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="w-10 h-10 rounded-xl flex items-center justify-center border border-border text-lg shrink-0"
                        style={{ background: `${wItem.color}22` }}
                      >
                        {getPieceEmoji(wItem.category)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-foreground truncate">
                        {wItem.name}
                      </p>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {wItem.colorName}
                      </p>
                    </div>
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-card border-2 border-turquoise text-foreground shrink-0">
                      Pick
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

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
