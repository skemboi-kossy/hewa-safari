//Weather code descriptions,data helpers and packing tips.
import { t, dayName } from "./i18n.js";

// WMO weather codes used by Open-Meteo.
const CODES = [
  { codes: [0], icon: "☀️", en: "Clear sky", sw: "Anga safi" },
  { codes: [1], icon: "🌤️", en: "Mainly clear", sw: "Angavu kwa kiasi kikubwa" },
  { codes: [2], icon: "⛅", en: "Partly cloudy", sw: "Mawingu kiasi" },
  { codes: [3], icon: "☁️", en: "Overcast", sw: "Mawingu mazito" },
  { codes: [45, 48], icon: "🌫️", en: "Fog", sw: "Ukungu" },
  { codes: [51, 53, 55, 56, 57], icon: "🌦️", en: "Drizzle", sw: "Manyunyu" },
  { codes: [61, 63, 66], icon: "🌧️", en: "Rain", sw: "Mvua" },
  { codes: [65, 67], icon: "🌧️", en: "Heavy rain", sw: "Mvua kubwa" },
  { codes: [71, 73, 75, 77, 85, 86], icon: "❄️", en: "Snow", sw: "Theluji" },
  { codes: [80, 81, 82], icon: "🌦️", en: "Rain showers", sw: "Mvua za rasharasha" },
  { codes: [95, 96, 99], icon: "⛈️", en: "Thunderstorm", sw: "Mvua ya radi" },
];

export function describe(code, lang) {
  const match = CODES.find((entry) => entry.codes.includes(code));
  if (!match) return { icon: "🌡️", text: lang === "sw" ? "Haijulikani" : "Unknown" };
  return { icon: match.icon, text: match[lang] || match.en };
}

export const RAINY_CHANCE = 50; // % chance from which a day counts as rainy

export function formatTemp(value, unit) {
  return `${Math.round(value)}°${unit}`;
}

function toCelsius(value, unit) {
  return unit === "F" ? ((value - 32) * 5) / 9 : value;
}

export function sortDays(days, sortBy) {
  const sorted = [...days];
  const by = {
    warmest: (a, b) => b.max - a.max,
    coolest: (a, b) => a.max - b.max,
    driest: (a, b) => a.rainChance - b.rainChance || a.rainMm - b.rainMm,
    wettest: (a, b) => b.rainChance - a.rainChance || b.rainMm - a.rainMm,
  }[sortBy];
  return by ? sorted.sort(by) : sorted; // "date" keeps the API order
}

export function filterDays(days, { dryOnly, minHigh }) {
    return days.filter((day) => {
        if (dryOnly && day.rainChance >= RAINY_CHANCE) return false;
        if (Number.isFinite(minHigh) && day.max < minHigh)
            return false;
        return true;
    });
}


//Best day for being outdoors: lowest rain chance, then least wind.
export function bestDay(days) {
    if (!days.length) return null;
    return [...days].sort((a, b) => a.rainChance - b.rainChance || a.wind - b.wind)[0];
}

export function summarize(days) {
  const avg = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    avgHigh: avg(days.map((d) => d.max)),
    avgLow: avg(days.map((d) => d.min)),
    rainyDays: days.filter((d) => d.rainChance >= RAINY_CHANCE).length,
    best: bestDay(days),
  };
}

// Builds practical tips from the forecast. Thresholds are in °C and km/h.
export function packingTips(days, lang, unit) {
  const tips = [];
  const names = (list) => list.map((d) => dayName(lang, d.date)).join(", ");

  const rainy = days.filter((d) => d.rainChance >= RAINY_CHANCE);
  if (rainy.length) tips.push(t(lang, "tipUmbrella", { days: names(rainy) }));

  const hottest = days.reduce((a, b) => (b.max > a.max ? b : a));
  if (toCelsius(hottest.max, unit) >= 30) {
    tips.push(t(lang, "tipHot", { max: formatTemp(hottest.max, unit) }));
  }

  const coldest = days.reduce((a, b) => (b.min < a.min ? b : a));
  if (toCelsius(coldest.min, unit) <= 12) {
    tips.push(t(lang, "tipCold", { min: formatTemp(coldest.min, unit) }));
  }

  const maxUv = Math.max(...days.map((d) => d.uv));
  if (maxUv >= 8) tips.push(t(lang, "tipUv", { uv: Math.round(maxUv) }));

  const windy = days.filter((d) => d.wind >= 40);
  if (windy.length) tips.push(t(lang, "tipWind", { days: names(windy) }));

  if (!rainy.length) tips.push(t(lang, "tipDry"));
  return tips;
}
