@echo off
REM DealerHunt — self-updating scrape cycle for the Windows scraper box.
REM Point Windows Task Scheduler at THIS file (e.g. every 30 minutes). It pulls
REM the latest code, installs any new deps, then runs one scrape cycle.
REM New parser fixes deploy themselves — no remote access needed.

cd /d "%~dp0.."

echo [%date% %time%] Pulling latest code...
git pull --rebase --autostash origin main

echo [%date% %time%] Installing deps (fast when unchanged)...
call npm install --no-audit --no-fund --silent

echo [%date% %time%] Running scrape cycle...

REM ── Source list: only proven, working sources (removes ghost sources that
REM    were causing silent failures: traderev, carsdirect, lkq, driveway, iseecars).
set SCRAPE_SOURCES=craigslist,carvana,autotempest,ebay_motors,copart,autotrader,cars_com,cargurus,publicsurplus,ebay_sold,offerup

REM ── Adaptive Craigslist: scrape the stalest cities first, not a fixed rotation.
set CL_ADAPTIVE=1
set CL_ADAPTIVE_COUNT=8

REM ── Concurrency: Windows Docker has headroom — 5 parallel (was 3).
set SCRAPE_CONCURRENCY=5

call npm run scrape:ci

echo [%date% %time%] Scrape done. Running health check...
node scripts/health-check.mjs

echo [%date% %time%] Cycle complete.
