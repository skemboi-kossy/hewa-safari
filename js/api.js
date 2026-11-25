// Talks to the Open-Meteo APIs (no API key required ), with caching,
// timeouts and clear error types.
const GEO_URL ="https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30minutes
const TIMEOUT_MS = 10000;
const CACHE_PREFIX = "hewa-safari:";


const memoryCache = new Map();


export class ApiError extends Error {
    // code is one of : "network", "timeout". "api", "invalid"
    constructor(code,message) {
        super(message);
        this.code = code;
    }
}

function readCache(key) {
    const now = Date.now();
    const hit = memoryCache.get(key);
    if (hit && now - hit.time < CACHE_TTL_MS) return hit.data;
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (raw) {
            const entry = JSON.parse (raw);
            if (now - entry.time < CACHE_TTL_MS) {
                memoryCache.set(key, entry);
                return entry.data;
                }
                localStorage.removeItem(CACHE_PREFIX + key);
            }
        } catch (err) {
            // Storage unavailable or corrupted: just skip the cache.
        }
        return null
    }


    function writeCache(key, data) {
        const entry = { time: Date.now(), data };
        memoryCache.set(key, entry);
        try {
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
        } catch (err) {
            // Storage full or blocked: the in-memory cache still works.
        }
    }


    async function getJson(url) {
        const cached = readCache(url);
        if (cached) return cached;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(),
        TIMEOUT_MS);
        let response;
        try {
            response = await fetch(url, { signal: controller.signal});
        } catch (err) {
            throw new ApiError(err.name === "AbortError" ? "timeout" : "network", err.message); 
        } finally {
            clearTimeout(timer);
        }

        let body;
        try {
            body =await response.json();
        } catch (err) {
            throw new ApiError("invalid", "Response was not valid JSON");
        }
        if (!response.ok || (body && body.error)) {
            throw new ApiError("api", (body && body.reason) || `HTTP ${response.status}`);
         }


    writeCache(url, body);
    return body;
}



// Finds up to 6 places matching a name.
export async function searchCities(name) {
    const params = new URLSearchParams({
        name: name.trim(),
        count: "6",
        language: "en",
        format: "json",
    });
    const data = await getJson(`${GEO_URL}?${params}`);
    if (!data || (data.results !== undefined && !Array.isArray(data.results))) {
        throw new ApiError("invalid", "Unexpected geocoding response");
    }
    return (data.results || []).map((r) => ({
        id: r.id,
        name: r.name,
        region:r.admin1 || "",
        country:r.country || "",
        latitude:r.latitude,
        longitude:r.longitude,
    }));
}

// Gets current conditions and a 7-day daily forecast for a place.
export async function getForecast(city, unit) {
    const params = new URLSearchParams({
        latitude: String(city.latitude),
        longitude: String(city.longitude),
        timezone: "auto",
        forecast_days:"7",
        temperature_unit: unit ===  "F" ? "fahrenheit" : "celsius",
        wind_speed_unit: "kmh",
        current: "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
        daily: [
            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max",
            "precipitation_sum",
            "wind_speed_10m_max",
            "uv_index_max",
        ].join(","),
    });
    const data = await getJson(`${FORECAST_URL}?${params}`);
    const d = data && data.daily;
    if (!d || !Array.isArray(d.time) || !Array.isArray(d.temperature_2m_max)) {
        throw new ApiError("invalid", "Forecast response is missing daily data");
    }


    const days = d.time.map((date, i) => ({
        date,
        code:d.weather_code[i],
        max: d.temperature_2m_max[i],
        min: d.temperature_2m_min[i],
        rainChance: d.precipitation_probability_max[i] ?? 0,
        rainMm: d.precipitation_sum[i] ?? 0,
        wind: d.wind_speed_10m_max[i] ?? 0,
        uv: d.uv_index_max[i] ?? 0,
    }));

    const c = data.current;
    const current = c 
        ? {
            temp: c.temperature_2m,
            humidity: c.relative_humidity_2m,
            code: c.weather_code,
            wind: c.wind_speed_10m,
        }
    : null;


return { current, days };


    }
