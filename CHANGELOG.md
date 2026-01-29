# Changelog

## [1.3] - 2026-01-27

### 🎯 Major Changes

#### Domain Separation (sreda.pw vs go.sreda.pw)
- **Strict domain-based routing**: Implemented complete separation between brand landing and product pages
  - `sreda.pw` / `www.sreda.pw` → SREDA brand landing (infrastructure-focused)
  - `go.sreda.pw` → ISKRA product pages (smartlinks, artists, releases)
- **Architecture**: Refactored monolithic `fetch` handler into `handleSreda()` and `handleGo()` functions
- **404 handling**: `sreda.pw` returns 404 for all paths except root and static assets

#### SREDA Brand Landing Refactor
- **Infrastructure-focused positioning**: Transformed from marketing landing to system node
  - Key messaging: "Инфраструктура музыкальной экосистемы"
  - Removed all marketing language, promises, and emotional formulas
  - Dry, engineering tone throughout
- **Content updates**:
  - Added "процессами" to infrastructure description
  - Changed "Сейчас доступен" → "Доступен" (removed conversational tone)
  - Renamed "Доступный модуль" → "Инфраструктурный модуль"
  - Replaced "ISKRA" with "ИСКРА" (Cyrillic) in all user-facing text
- **Visual updates**:
  - Added SREDA logo SVG (replaced text "SREDA")
  - Logo size: 6.3rem (reduced from 9rem)
  - Increased container width: max-width 1000px (from 900px)
  - Reduced background vignette opacity: 0.6 (from 0.92)
  - Added feature cards section (4 cards, 2 columns desktop, 1 mobile)
  - Single CTA button: "Перейти в ISKRA" → go.sreda.pw
  - Removed secondary CTAs (Telegram link, demo link)
  - Compact footer
- **UX refinements**:
  - Increased spacing between CTA and feature cards (+16px)
  - Reduced card text opacity: 0.55 (from 0.65)
  - Improved visual hierarchy

### ✨ Features

#### Page Transitions & Animations
- **Smooth page transitions**: Added fade-out/fade-in effects for internal navigation
- **Page enter animation**: Slide-up (12px) + fade-in with cubic-bezier easing
- **Loading shimmer**: Hover effect on primary button with animated shimmer

#### Performance Optimizations
- **Increased caching**: HTML cache from 60s to 300s (5 minutes)
- **Font loading**: Added `display=swap` to Google Fonts for faster perceived load
- **Background fix**: Added background to `html` element to prevent black bar at bottom

#### UI/UX Improvements
- **Noise pattern**: Restored on all pages (was temporarily removed from artist/smartlink pages)
- **Telegram link**: Added link to project updates channel (https://t.me/sreda_music)
- **Geo-debug logging**: Added logging for troubleshooting access issues from Russia

### 🐛 Bug Fixes
- Fixed `go.sreda.pw/` returning 404 (moved root path check earlier in `handleGo`)
- Fixed black bar at bottom of page (added background to html element)
- Fixed noise pattern disappearing (removed conditional hiding)

### 📝 Technical Details
- **Routes**: Added explicit routes for `sreda.pw/*` and `www.sreda.pw/*` in `wrangler.toml`
- **Code structure**: Separated domain handling logic for better maintainability
- **Cache headers**: Standardized to 5 minutes for HTML responses

---

## [1.2] - Previous version
- Initial domain separation setup
- Basic SREDA brand landing
- ISKRA product pages
