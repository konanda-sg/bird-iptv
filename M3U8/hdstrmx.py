from functools import partial

import httpx
from playwright.async_api import async_playwright
from selectolax.parser import HTMLParser

from .utils import Cache, Time, get_logger, leagues, network

log = get_logger(__name__)

urls: dict[str, dict[str, str | float]] = {}

CACHE_FILE = Cache("hdstrmx.json", exp=10_800)

HTML_CACHE = Cache("hdstrmx-html.json", exp=28_800)

BASE_URL = "https://hdstreamex1.blogspot.com"


def fix_league(s: str) -> str:
    return " ".join(x.capitalize() for x in s.split())


async def refresh_html_cache(
    client: httpx.AsyncClient,
    url: str,
) -> dict[str, dict[str, str | float]]:

    try:
        r = await client.get(url)
        r.raise_for_status()
    except Exception as e:
        log.error(f'Failed to fetch "{url}": {e}')

        return {}

    soup = HTMLParser(r.text)
    now = Time.now()

    events = {}

    for row in soup.css("tr.bg-white, tr.bg-gray-50"):
        if valid_row := row.css("td"):
            time_el = valid_row[1]

            sport_el = valid_row[2].css_first("span")

            name_el = valid_row[3].css_first(".font-medium")

            href_el = valid_row[-1].css_first("a[href]")

            if not (time_el and sport_el and name_el and href_el):
                continue

            if not (href := href_el.attributes.get("href")):
                continue

            sport = fix_league(sport_el.text(strip=True))

            event_name = name_el.text(strip=True)

            event_dt = Time.from_str(
                f"{now.date()} {time_el.text(strip=True)}",
                timezone="EST",
            )

            key = f"[{sport}] {event_name} (HDSTRMX)"

            events[key] = {
                "sport": sport,
                "event": event_name,
                "link": href,
                "event_ts": event_dt.timestamp(),
                "timestamp": now.timestamp(),
            }

    return events


async def get_events(
    client: httpx.AsyncClient,
    cached_keys: set[str],
) -> list[dict[str, str]]:

    now = Time.clean(Time.now())

    if not (events := HTML_CACHE.load()):
        events = await refresh_html_cache(client, BASE_URL)

        HTML_CACHE.write(events)

    live = []

    start_ts = now.delta(hours=-1).timestamp()
    end_ts = now.delta(minutes=15).timestamp()

    for k, v in events.items():
        if cached_keys & {k}:
            continue

        if not start_ts <= v["event_ts"] <= end_ts:
            continue

        live.append({**v})

    return live


async def scrape(client: httpx.AsyncClient) -> None:
    cached_urls = CACHE_FILE.load()
    cached_count = len(cached_urls)
    urls.update(cached_urls)

    log.info(f"Loaded {cached_count} event(s) from cache")

    log.info(f'Scraping from "{BASE_URL}"')

    events = await get_events(client, set(cached_urls.keys()))

    log.info(f"Processing {len(events)} new URL(s)")

    if events:
        async with async_playwright() as p:
            browser, context = await network.browser(p, browser="brave")

            for i, ev in enumerate(events, start=1):
                handler = partial(
                    network.process_event,
                    url=ev["link"],
                    url_num=i,
                    context=context,
                    log=log,
                )

                url = await network.safe_process(
                    handler,
                    url_num=i,
                    log=log,
                )

                if url:
                    sport, event, ts = ev["sport"], ev["event"], ev["event_ts"]

                    tvg_id, logo = leagues.get_tvg_info(sport, event)

                    key = f"[{sport}] {event} (HDSTRMX)"

                    entry = {
                        "url": url,
                        "logo": logo,
                        "base": BASE_URL,
                        "timestamp": ts,
                        "id": tvg_id or "Live.Event.us",
                    }

                    urls[key] = cached_urls[key] = entry

            await browser.close()

    if new_count := len(cached_urls) - cached_count:
        log.info(f"Collected and cached {new_count} new event(s)")
    else:
        log.info("No new events found")

    CACHE_FILE.write(cached_urls)
