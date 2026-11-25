//  Hewa Safari:user interface and application state.
import { t, dayName } from "./i18n.js";
import { searchCities, getForecast } from "./api.js";
import {
    describe,
    formatTemp,
    sortDays,
    filterDays,
    summarize,
    packingTips,
} from "./weather.js";


const MAX_CITIES = 4;
const SETTINGS_KEY = "hewa-safari:settings";
const DEFAULT_CITY = {
    name: "Kigali",
    region: "Kigali",
    country: "Rwanda",
    latitude: -1.94995,
    longitude: 30.05885,
};


const state = {
    lang: "en",
    unit: "C",
    sortBy: "date",
    dryOnly: false,
    minHigh: NaN,
    cities: [], //  {city, forecast, error, loading }
    activeKey: null,
};


const $ = (selector) => document.querySelector(selector);

//  ---------- helpers ---------

// Creates an element. Text is always set with textContent,never innerHTML,
// so  data from the API or the user can't inject HTML (XSS protection)
function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(props)) {
        if (name === "class") node.className = value;
        else if (name === "text") node.textContent = value;
        else if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
        else node.setAttribute(name, value);
}
for (const child of [].concat(children)) {
    if (child !== null && child !== undefined) node.append(child);
}
return node;

}


const cityKey = (city) =>
    `${city.latitude.toFixed(2)},${city.longitude.toFixed(2)}`;


function cityLabel(city) {
    return [city.name, city.region !== city.name ? city.region : "", city.country] .filter(Boolean) .join(", ");
}

function shortDate(iso) {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}



function errorMessage(err) {
    const lang = state.lang;
    switch (err && err.code) {
        case "network":
            return t(lang,"errNetwork");
        case "timeout":
            return t(lang, "errTimeout");
        case "api":
            return `${t(lang, "errApi")}: ${err.message}` ; default:
            return t(lang, "errInvalid");
    }
}

function showStatus(message, retry) {
    const box = $("#status");
    box.replaceChildren();
    if (!message) {
        box.hidden = true;
        return;
    }
    box.hidden = false;
    box.append(el("span", { text: message }));
    if (retry) {
        box.append(el("button", { class: "link-button", type: "button", text: t(state.lang, "retry"), onclick: retry }));
    }
}


// ---------- settings persistence ---------

function saveSettings() {
    const data = {
        lang: state.lang,
        unit: state.unit,
        sortBy: state.sortBy,
        dryOnly: state.dryOnly,
        cities: state.cities.map((entry) => entry.city),
        activeKey: state.activeKey,
    };
    try{
        localStorage.setItem(SETTINGS_KEY,JSON.stringify(data));
    }catch (err) {
        // Storage blocked: settings just won't be remembered.
    }
}

function loadSettings() {
    try {
        const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
        if (!data) return;
        if (data.lang === "en" || data.lang === "sw") state.lang = data.lang;
        if (data.unit === "C" || data.unit === "F") state.unit = data.unit;
        if (["date", "warmest", "coolest", "driest", "wettest"].includes(data.sortBy)) state.sortBy = data.sortBy; state.dryOnly = Boolean(data.dryOnly);
        if (Array.isArray(data.cities)) { state.cities = data.cities  .filter((c) => c && typeof c.name === "string" &&
             Number.isFinite(c.latitude) &&
             Number.isFinite(c.longitude))
                .slice(0, MAX_CITIES)
                .map((city) => ({ city, forecast: null, error: null, loading: false }));
             }
             state.activeKey = data.activeKey || null;
            
              }  catch (err) {
            // Corrupted settings: start fresh.
        }  
    }

    // --------- actions -----------

    async function loadForecast(entry) {
        entry.loading = true;
        entry.error = null;
        render() ;
        try {
            entry.forecast = await getForecast(entry.city, state.unit);
        } catch (err) {
            entry.forecast = null;
            entry.error = err;
        } finally {
            entry.loading = false;
            render();
        }
    }
    
    
    function addCity(city){
        const key = cityKey(city);
        if (state.cities.some((entry) => cityKey(entry.city) === key)) {
            state.activeKey = key;
            showStatus(t(state.lang, "alreadyAdded"));
                render();
                return;
        }
        if (state.cities.length >= MAX_CITIES) {
            showStatus(t(state.lang, "maxCities"));
            return;
        }
        const entry = { city, forecast: null, error: null, loading: false };
        state.cities.push(entry);
        state.activeKey = key;
        showStatus(null);
        $("#results").replaceChildren();
        saveSettings();
        loadForecast(entry);
    }

    function removeCity(key) {
        state.cities = state.cities.filter((entry) => cityKey(entry.city) !== key);
        if (state.activeKey === key) { state.activeKey = state.cities.length ? cityKey(state.cities[0].city) : null;
        }
        saveSettings();
        render();
    }

    async function handleSearch(event) {
        event.preventDefault();
        const query = $("#search-input").value.trim().slice(0, 80);
        const results = $("#results");
        results.replaceChildren();
        if (query.length < 2) {
            showStatus(t(state.lang, "tooShort"));
            return;
        }
        showStatus(t(state.lang, "loading"));
        try {
            const cities = await searchCities(query);
            showStatus(null);
            if (!cities.length) {
                showStatus(t(state.lang, "noResults"));
                return;
            }
            results.append(el("p", { class: "results-title", text: t(state.lang, "resultsTitle") }));
            const list = el("ul", { class: "results-list" });
            for (const city of cities) {
                list.append(
                    el("li", {}, el("button", { type: "button", class: "result", text: cityLabel(city), onclick: () => addCity(city) })) 
                );
            }
            results.append(list);
        }   catch (err) {
            showStatus(errorMessage(err), () => $("#search-form").requestSubmit());
        }
    }


    function setLanguage(lang) {
        state.lang = lang;
        saveSettings();
        applyStaticText();
        render();
    }

    function setUnit(unit) {
        if (unit === state.unit) return;
        state.unit = unit;
        state.minHigh = NaN;   //  the old threshold was in the other unit
        $("#min-high").value = "";
        saveSettings();
        applyStaticText();
        state.cities.forEach(loadForecast);
    }

    // ---------- rendering ----------

    function applyStaticText() {
        const lang = state.lang;
        document.documentElement.lang = lang;
        document.querySelectorAll("[data-i18n]").forEach((node) => {
            node.textContent = t(lang, node.dataset.i18n); 
        });
        document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
            node.placeholder =t(lang, node.dataset.i18nPlaceholder);
        });
        document.querySelectorAll("[data-lang]").forEach((btn) => {
            btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
        });
        document.querySelectorAll("[data-unit]").forEach((btn) => {
            btn.setAttribute("aria-pressed", String(btn.dataset.unit === state.unit));
        });
        $("#min-high-unit").textContent = `°${state.unit}` ;
        $("#sort-select").value = state.sortBy;
        $("#dry-only").checked = state.dryOnly;
    }


    function renderChips() {
        const box = $("#city-chips");
        box.replaceChildren();
        if (!state.cities.length) {
            box.append(el("p", { class: "muted", text: t(state.lang, "noCities") }));
            return;
        }
        for (const entry of state.cities) {
            const key = cityKey(entry.city);
            const active = key === state.activeKey;
            box.append(
                el("div", { class: `chip${active ? " active" : ""}` }, [
                    el("button", {
                        type: "button",
                        class: "chip-name",
                        "aria-pressed": String(active),
                        text: entry.city.name,
                        onclick: () => {
                            state.activeKey = key;
                            saveSettings();
                            render();
                        },
                    }),
                    el("button", {
                        type: "button",
                        class: "chip-remove",
                        "aria-label": `${t(state.lang, "remove")} ${entry.city.name}`,
                        title: t(state.lang, "remove"),
                        text: "x",
                        onclick: () => removeCity(key),
                    }),
                ])
            );
        }
    }


    function renderCurrent(entry) {
        const box = $("#current");
        box.replaceChildren();
        const now = entry.forecast.current;
        if (!now) return;
        const { icon, text } = describe(now.code, state.lang);
        box.append(
            el("div", { class: "current-main" }, [
                el("span", { class: "current-icon", "aria-hidden": "true", text:icon }),
                el("div", {}, [
                    el("p", { class: "eyebrow", text: `${t(state.lang,"now")} . ${cityLabel(entry.city)}` }),
                    el("p", { class: "current-temp", text: formatTemp(now.temp, state.unit) }),
                    el("p", {class: "current-desc", text }),
                ]),
            ]),
            el("dl", { class: "current-stats" }, [
                el("div", {}, [el("dt", { text: t(state.lang, "humidity") }), el("dd", { text: `${now.humidity}%` })]),
                el("div", {}, [el("dt", { text: t(state.lang, "wind") }), el("dd", { text: `${Math.round(now.wind)} km/h` })]),
            ])
        );
    }
     function renderDays(entry) {
        const box = $("#days");
        box.replaceChildren();
        const all = entry.forecast.days;
        const best = summarize(all).best;
        const shown = sortDays(filterDays(all, {dryOnly: state.dryOnly, minHigh: state.minHigh }), state.sortBy);
        if (!shown.length) {
            box.append(el("p", { class: "muted", text: t(state.lang, "noDaysMatch") }));
            return;
        }
        for (const day of shown) {
            const { icon, text } = describe(day.code, state.lang);
            const isBest = best && day.date === best.date;
            box.append(
                el("article", { class: `day${isBest ? " best" : ""}` }, [
                    el("header", {}, [
                        el("h3", { text: dayName(state.lang, day.date) }),
                        el("span", {class: "muted", text: shortDate(day.date) }), ]),
                        isBest ? el("p", { class: "badge", text: `⭐ ${t(state.lang, "bestDay")}` }) :null,
                        el("p", { class: "day-icon", "aria-hidden": "true", text: icon }),
                            el("p", { class: "day-desc", text }),
                            el("p", {class: "day-temps" }, [
                                el("strong", { text: formatTemp(day.max, state.unit) }),
                                el("span", { class: "muted", text: ` / ${formatTemp(day.min, state.unit)}` }), 
                            ]),
                                el("dl", { class: "day-stats" }, [
                                    el("div", {}, [el("dt", { text: t(state.lang,"rainChance") }), el("dd", { text: `${day.rainChance}%` })]),
                                    el("div", {}, [el("dt", { text: t(state.lang, "rainAmount") }), el("dd", { text: `${day.rainMm.toFixed(1)} mm` })]),
                                el("div", {}, [el("dt", { text: t(state.lang, "wind") }), el("dd", { text: `${Math.round(day.wind)} km/h` })]),
                                el("div", {}, [el("dt", { text: t(state.lang, "uv") }), el("dd", { text: String(Math.round(day.uv)) })]),
 ]),
      ])
    );
  }
}
                      
                  



function renderTips(entry) {
  const box = $("#tips");
  box.replaceChildren();
  for (const tip of packingTips(entry.forecast.days, state.lang, state.unit)) {
    box.append(el("li", { text: tip }));
  }
}

function renderCompare() {
  const section = $("#compare-section");
  const body = $("#compare-body");
  body.replaceChildren();
  const ready = state.cities.filter((entry) => entry.forecast);
  section.hidden = ready.length < 2;
  for (const entry of ready) {
    const s = summarize(entry.forecast.days);
    const best = s.best ? `${dayName(state.lang, s.best.date)} ${shortDate(s.best.date)}` : "–";
    body.append(
      el("tr", {}, [
        el("th", { scope: "row", text: entry.city.name }),
        el("td", { text: formatTemp(s.avgHigh, state.unit) }),
        el("td", { text: formatTemp(s.avgLow, state.unit) }),
        el("td", { text: String(s.rainyDays) }),
        el("td", { text: best }),
      ])
    );
  }
}

function render() {
  renderChips();
  renderCompare();

  const entry = state.cities.find((e) => cityKey(e.city) === state.activeKey);
  const panel = $("#forecast-panel");
  const message = $("#forecast-message");
  message.replaceChildren();

  if (!entry) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const hasData = Boolean(entry.forecast) && !entry.loading;
  $("#forecast-body").hidden = !hasData;

  if (entry.loading) {
    message.append(el("p", { class: "muted", text: t(state.lang, "loading") }));
    return;
  }
  if (entry.error) {
    message.append(
      el("div", { class: "error" }, [
        el("span", { text: errorMessage(entry.error) }),
        el("button", { type: "button", class: "link-button", text: t(state.lang, "retry"), onclick: () => loadForecast(entry) }),
      ])
    );
    return;
  }
  if (hasData) {
    renderCurrent(entry);
    renderDays(entry);
    renderTips(entry);
  }
}

//Shows which web server answered (from the X-served-By header set by Nginx).
async function showServedBy() {
    try {
        const response = await fetch(window.location.pathname,{ method: "HEAD",cache: "no-store" });
        const server = response.headers.get("X-served-By");
        if (server) {
            $("#served-by-name").textContent = server;
            $("#served-by").hidden = false;
        }
    }catch (err) {
        //Not important if this fails (e.g when running locally).
    }
}

// ---------- start ---------

function init() {
    loadSettings();
    applyStaticText();

    $("#search-form").addEventListener("submit", handleSearch);
    document.querySelectorAll("[data-lang]").forEach((btn) => btn.addEventListener("click", () => setLanguage(btn.dataset.lang))
    );
    document.querySelectorAll("[data-unit]").forEach((btn) => btn.addEventListener("click", () => setUnit(btn.dataset.unit))
    );
    $("#sort-select").addEventListener("change", (e) => {
        state.sortBy = e.target.value;
        saveSettings();
        render();
    });
    $("#dry-only").addEventListener("change", (e) => {
        state.dryOnly = e.target.checked;
        saveSettings();
        render();
    });
    $("#min-high").addEventListener("input", (e) => {
        const value = parseFloat(e.target.value);
        state.minHigh = Number.isFinite(value) ? value :NaN;
        render();
    });

    if (!state.cities.length) {
        addCity(DEFAULT_CITY);
    }else {
        if (!state.cities.some((e) => cityKey(e.city) === state.activeKey)) {
            state.activeKey = cityKey(state.cities[0].city);
        }
        state.cities.forEach(loadForecast);
    }
    showServedBy();
}


init();










    
                          
  
            

        
     



        
        
    
        
    




