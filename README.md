# 🌍 Hewa Safari: Weather for your journey

**Hewa Safari** (Kiswahili: *hewa* = weather/air, *safari* = journey) is a bilingual
(English / Kiswahili) web app that helps people **plan their week and their trips**
using real weather forecasts.

Instead of just showing numbers, it answers practical questions:

- *Which day this week is best for an outdoor event or a road trip?*
- *Do I need an umbrella or a jacket, and on which days?*
- *Is Nairobi or Kigali drier this week for my visit?*

It is built for students, travellers and anyone planning outdoor activities in East
Africa and beyond, with a Kiswahili interface for users who prefer it.

**Live (through the load balancer):** http://18.133.231.204/hewa-safari/

---

## Features

| Feature | Description |
| --- | --- |
| City search | Search any city in the world and pick the right one from a list |
| 7-day forecast | Daily high/low, weather description, rain chance, rain amount, wind and UV index |
| Current conditions | Temperature, humidity and wind right now |
| Sorting | Sort days by date, warmest, coolest, driest or wettest |
| Filtering | Show dry days only and/or days above a minimum high temperature |
| Best outdoor day | Highlights the day with the lowest rain chance and least wind |
| Packing & planning tips | Generated from the data: umbrella days, heat, cold nights, strong UV, wind |
| Compare up to 4 cities | Side-by-side table: average high/low, rainy days, best day |
| English / Kiswahili | The whole interface, weather descriptions and day names switch language |
| °C / °F | Switch temperature units |
| Remembers you | Your cities, language and settings are saved in your browser |
| Caching | API responses are cached for 30 minutes for faster loads and fewer API calls |
| Served-by indicator | The footer shows which web server (web-01 / web-02) answered the request |

### Error handling
- **No internet / API down:** a clear message with a "Try again" button
- **Slow API:** requests time out after 10 seconds with a friendly message
- **API error responses:** the reason returned by the API is shown
- **Invalid or unexpected data:** detected and reported instead of crashing
- **No search results / too-short search:** a helpful message
- **Blocked or corrupted browser storage:** the app keeps working without it

### Security
- **No API keys:** Open-Meteo is free and keyless, so there are no secrets to leak. `.gitignore` still blocks `.env`, keys and certificates as a safeguard.
- **XSS protection:** all text from the API and the user is inserted with `textContent`, never `innerHTML`.
- **Input validation:** search input is trimmed, limited to 80 characters and needs at least 2 letters; saved settings are validated before use.

---

## APIs used (credits)

| API | Used for | Documentation |
| --- | --- | --- |
| Open-Meteo Forecast API | Current weather and 7-day daily forecast | https://open-meteo.com/en/docs |
| Open-Meteo Geocoding API | Turning city names into coordinates | https://open-meteo.com/en/docs/geocoding-api |

### API details (from the official documentation)

| Detail | Value |
| --- | --- |
| Endpoints | `GET https://geocoding-api.open-meteo.com/v1/search` and `GET https://api.open-meteo.com/v1/forecast` |
| Authentication | None: no API key or sign-up for non-commercial use |
| Format | JSON over HTTPS, callable directly from the browser (CORS enabled) |
| Rate limits (free tier) | Fewer than 10,000 calls/day, 5,000/hour and 600/minute |
| Licence | Data under CC BY 4.0: attribution required (shown in the app footer) |

The app caches forecasts and searches for 30 minutes, so refreshing or switching
language reuses cached data instead of calling the API again.

**Vetting:** Open-Meteo is open-source, uses HTTPS only, returns plain JSON (no
scripts) and gets its data from national weather services.

Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Thanks to the
Open-Meteo developers for a free, open, keyless weather API.

---

## Project structure

```
hewa-safari/
├── index.html        # Page structure
├── css/style.css     # Styling (responsive, savanna-inspired theme)
├── js/app.js         # User interface, state, rendering, events
├── js/api.js         # Open-Meteo requests, caching, timeouts, error types
├── js/weather.js     # Weather codes, sorting, filtering, summaries, tips
├── js/i18n.js        # English and Kiswahili text
├── deploy/deploy.sh  # Deploys the app to web-01 and web-02
├── .gitignore
└── README.md
```

Plain HTML, CSS and JavaScript (ES modules): no frameworks, no build step, no dependencies.

---

## Running locally

The app uses JavaScript modules, so it must be opened through a local web server
(double-clicking `index.html` will not work).

```bash
git clone https://github.com/skemboi-kossy/hewa-safari.git
cd hewa-safari
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

- On Windows, run these commands in **WSL (Ubuntu)**: type `wsl` in PowerShell first, because `python3` is not installed on Windows itself.
- Alternative: in VS Code, install the **Live Server** extension, right-click `index.html` and choose **Open with Live Server**.

No API key or configuration is needed.

---

## Deployment

### Infrastructure

| Server | Role | IP |
| --- | --- | --- |
| 7429-web-01 | Web server (Nginx) | 35.179.132.8 |
| 7429-web-02 | Web server (Nginx) | 18.130.180.117 |
| 7429-lb-01 | Load balancer (HAProxy) | 18.133.231.204 |

```
                    ┌──► web-01 (Nginx) ──┐
User ──► lb-01 ─────┤    roundrobin       ├── /var/www/html/hewa-safari/
       (HAProxy)    └──► web-02 (Nginx) ──┘
```

### 1. Web servers (web-01 and web-02)

Both servers run Nginx, set up in my earlier `web_server` and `load_balancer`
projects. Each server adds a header that identifies it:

```nginx
add_header X-Served-By $hostname;
```

The app is static, so Nginx serves the files directly. It is deployed to
`/var/www/html/hewa-safari/`, so it is available at `/hewa-safari/` while the
server root `/` keeps serving the page required by my other projects.

Deploy to both servers with one command, from the project folder:

```bash
bash deploy/deploy.sh
```

The script:
1. Packs `index.html`, `css/` and `js/` into an archive
2. Copies it to each web server with `scp` (using my SSH key)
3. Extracts it to `/var/www/html/hewa-safari/` and sets the owner to `www-data`
4. Checks the Nginx configuration with `nginx -t` and reloads Nginx

### 2. Load balancer (lb-01)

HAProxy on lb-01 listens on port 80 and sends requests to the two web servers
using the **roundrobin** algorithm (web-01, web-02, web-01, …). `check` turns on
health checks, so if one server goes down, all traffic goes to the other.

```haproxy
listen web-backend
    bind *:80
    balance roundrobin
    option forwardfor
    server 7429-web-01 35.179.132.8:80 check
    server 7429-web-02 18.130.180.117:80 check
```

No HAProxy change was needed for this app: it forwards every path, including
`/hewa-safari/`, to the web servers.

### 3. Testing

```bash
for i in 1 2 3 4; do curl -sI http://18.133.231.204/hewa-safari/ | grep X-Served-By; done
```

Result: the answers alternate between `7429-web-01` and `7429-web-02`.

In the browser, http://18.133.231.204/hewa-safari/ works the same on both servers,
and the **"Served by"** line in the footer changes as you refresh.

---

## Challenges and how I solved them

- **Keeping API keys safe:** many weather APIs need a key, which a front-end-only app would expose. I chose Open-Meteo, which needs no key.
- **VS Code could not save my files:** VS Code lost its connection to WSL and every save failed with `EIO: i/o error`. I backed up my work, restarted WSL with `wsl --shutdown`, and moved the project to a Windows folder that WSL reaches through `/mnt/c/...`.
- **Typos stopping the whole app:** a single mistake, like `'` instead of a backtick around `${...}`, a misspelled `id` in the HTML (`resulsts` instead of `results`), or a comma instead of a dot, stopped all the JavaScript. I used the browser Console (F12), VS Code's Problems panel and the server log to find each one by line number.
- **Running the local server on Windows:** `python3` is not installed on Windows, so I ran the server from WSL (Ubuntu) instead.
- **Script line endings:** `deploy.sh` written on Windows had Windows line endings, which Bash cannot run. I converted it with `sed -i 's/\r$//' deploy/deploy.sh`.
- **HAProxy changing header names:** HAProxy 2.x sends `x-served-by` in lowercase. I used its `h1-case-adjust` option to restore `X-Served-By`.
- **Sharing servers with other projects:** the server root `/` must keep its original page for other graded tasks, so I deployed the app under `/hewa-safari/` and used relative paths.
- **Kiswahili weather terms:** I translated every WMO weather code into English and Kiswahili and added Kiswahili day names (Jumatatu, Jumanne, …).

---

## Demo video

▶️ Demo (under 2 minutes): [add your video link here]

---

## Author

Sandra Kemboi, African Leadership University
