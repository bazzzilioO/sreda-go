# Changelog

## [1.3] - 2026-01-29

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
- **Favicon**: Added star SVG favicon (simplified version without text)
- **Page wrapper sync**: Artists page wrapper width matches content grid (removed empty side gutters)

### 🐛 Bug Fixes
- Fixed `go.sreda.pw/` returning 404 (moved root path check earlier in `handleGo`)
- Fixed black bar at bottom of page (added background to html element)
- Fixed noise pattern disappearing (removed conditional hiding)

### 🎨 Artists List Page Improvements

#### Grid Layout & Card Sizing
- **Strict infrastructure-style grid**: Implemented dense, predictable grid layout
  - Grid: `repeat(4, minmax(176px, 1fr))` (reduced from 220px for ~20% smaller cards)
  - Container: `max-width: 900px`, `padding: 0 1rem`, `margin: 0 auto`
  - Gap: `0.4rem` (reduced from 0.5rem for tighter spacing)
  - Cards fill 100% of grid cells (no max-width/margin auto on cards)
- **Card visual weight reduction**: Reduced internal padding and visual mass
  - Card padding: `0.6rem` (reduced from 0.75rem)
  - Border radius: `12px` (reduced from 16px)
  - Softer borders and shadows for lighter appearance
- **Cover images**: Made full-bleed (no inner gaps)
  - Cover wrapper: `padding: 0`, `overflow: hidden`
  - Cover inherits top border radius only
  - Placeholder as overlay (no inner boxed look)
  - Placeholder text: `rgba(255,255,255,0.4)` for subtle appearance

#### Mobile Optimization (max-width: 640px)
- **Header compaction**:
  - Hidden subtitle under "Артисты"
  - Reduced vertical margins
  - Search input: full width, single row
- **Filters**: Compact dropdown system
  - "Фильтры" button (mobile-only, hidden on desktop)
  - Sorting buttons grouped in dropdown menu
  - Desktop: sorting buttons always visible
- **Cards**: Reduced vertical size by ~15-20%
  - Grid: `repeat(2, 1fr)` on mobile
  - Reduced padding under cover and title
  - Card action icon opacity: `0.45` (reduced from default)
  - Full opacity restored on interaction

#### Artist Photos
- **Display logic**: Cards now show `artist_photo_url` from artist page header
- **Fallback**: If `artist_photo_url` unavailable, uses latest release cover
- **SQL optimization**: Added CTE (`artist_photos`) to efficiently fetch photos
- **Result**: Consistent visual identity between list and detail pages

#### Header & Search Alignment
- **Synchronized width**: Header wrapper matches grid width (`max-width: 900px`)
- **Search input**: Reduced width for better grid alignment
- **Visual consistency**: Header, grid, and pagination share exact width

### 🗑️ Database Cleanup
- **Removed test data**: Deleted all artists except "AUNT TABBY" (aunt-tabby) and "был(а) давно" (byla-davno)
- **22 records deleted**: Cleaned up test artists and demo data

### 🤖 Telegram Bot Updates (iskra-bot)
- **Search result truncation**: Reduced label length by 30%
  - Changed from `60` to `42` characters max
  - Truncation: `39` characters + "…" (was `57` + "…")
  - Applied to all three search result locations in `handlers.py`

### 📝 Technical Details
- **Routes**: Added explicit routes for `sreda.pw/*` and `www.sreda.pw/*` in `wrangler.toml`
- **Code structure**: Separated domain handling logic for better maintainability
- **Cache headers**: Standardized to 5 minutes for HTML responses
- **SQL queries**: Optimized artist list queries with CTEs for better performance

---

## [1.2] - Previous version
- Initial domain separation setup
- Basic SREDA brand landing
- ISKRA product pages
