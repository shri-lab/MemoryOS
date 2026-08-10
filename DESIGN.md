# Canonical Design Specification: MemoryOS Mint Tech Aesthetic
**Project Name:** MemoryOS-mint-structural-redesign  
**Project ID:** 15322987021050462163 (Stitch MCP Generated)  
**Theme Identity:** Mint Tech / Cyber Minimalist  

---

## 1. Design Token Table (Single Source of Truth)

### Color Palette

| Token Name | Hex Value / CSS Variable | UI Role / Usage |
| :--- | :--- | :--- |
| **Near-Black Base** | `#0A0A0F` | Main layout background |
| **Mint Accent** | `#3EFFC4` | Primary actions, connections, glows, focus rings, and highlighted text elements |
| **Type Gray** | `#3A3A42` | Low-opacity oversized background wordmark text (approx. 7% opacity) |
| **Surface Glass** | `rgba(16, 16, 24, 0.4)` | Frosted glass panel fill |
| **High-Contrast Text**| `#FFFFFF` | Core titles, primary labels, active textual inputs |
| **Muted Text** | `#8F8F9B` | Secondary descriptions, timestamps, metadata labels |
| **Danger / Destructive**| `#FF3E3E` | Destructive operations, invalid states, alerts |

### Typography

| Category | Font Family | Size | Weight | Line Height | Letter Spacing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Large** | Sora | `48px` | `800` | `1.1` | `-0.04em` |
| **Headline Large**| Sora | `32px` | `700` | `1.2` | `-0.02em` |
| **Body Large** | Hanken Grotesk | `18px` | `400` | `1.6` | `0em` |
| **Body Medium** | Hanken Grotesk | `16px` | `400` | `1.6` | `0em` |
| **Label Medium** | JetBrains Mono | `14px` | `500` | `1.4` | `0.1em` |
| **Label Small** | JetBrains Mono | `12px` | `500` | `1.4` | `0.15em` |

### Spacing & System Geometry

| Token Name | Value | Description |
| :--- | :--- | :--- |
| **Spacing Unit** | `8px` | Baseline grid system |
| **Container Padding**| `24px` | Frosted panel internal padding |
| **Roundness** | `9999px` (`rounded-full`) | Control elements: Buttons, search inputs, active selection pills |
| **Panel Roundness** | `16px` (`rounded-2xl`) | Large structural container wrappers |
| **Backdrop Blur** | `blur(20px)` | Translucent layering |
| **Mint Glow** | `0 0 15px rgba(62, 255, 196, 0.35)` | Cyan/mint shadow applied to active states, connections, and buttons |

---

## 2. Global Layout & Navigation Architecture

### Left Vertical Navigation Rail
- **Placement & Type:** Slim vertical icon rail positioned on the far left edge of the desktop viewport (`w-20`). On mobile screens, it transitions to a bottom-anchored frosted tab bar.
- **Component Hierarchy & Items:**
  - **Top:** A small, sharp brand logo (`M` mark with a cyan glow).
  - **Center:** Vertically stacked icon-only navigation buttons: `HOME` (Dashboard), `LIBRARY` (Documents), `CHAT` (AI Chat), `GRAPH` (Connectome), and `SETTINGS` (Control). Labels display on hover as tooltips.
  - **Bottom:** Profile avatar trigger containing user credentials and logout actions.
- **Visual Feedback:** Active item shows a 3px vertical mint-green glowing indicator strip on the far-left screen margin, and the icon shifts to full mint-green.

### Global Command Palette (⌘K)
- **Placement & Type:** Floating central dialog command bar triggered from anywhere in the application via `⌘K` or `Ctrl+K`.
- **Treatment:** Fits over active screens with a heavy backdrop-blur filter (`backdrop-blur-md bg-obsidian/75`) to preserve background context while centering focus on a single input box with a mint glow and monospaced text listings.

---

## 3. Screen Layout & Composition Specifications

### Home / Landing Screen
- **Composition & Layout:** Large full-bleed centered landing layout.
- **Layout Structure:**
  - **Background Typography:** Giant `"MEMORYOS"` background wordmark text (opacity 7%) centered behind content.
  - **Featured Hero Element:** A stylized 3D/isometric visual representing a card stack connected by glowing mint-green connection lines.
  - **Search Bar Input:** Tucked under the hero visualization as a floating input box.
  - **Supporting CTA:** Clean pill-shaped all-caps action button `"EXPLORE MEMORYOS"`.

### Dashboard Screen
- **Composition & Layout:** Asymmetric 12-column bento grid module.
- **Layout Structure:**
  - **Background Typography:** Giant `"94.2%"` capacity indicator stenciled in background.
  - **Featured Hero Panel (8/12 width, tall):** Occupies the top-left area. Renders an interactive mini Knowledge Graph preview with connections and nodes.
  - **Supporting Panel 1 (4/12 width, tall):** Occupies the top-right area. Renders a dense list view of recent sync events and status badges.
  - **Supporting Panel 2 (4/12 width, wide):** Occupies the bottom-left area. Renders a quick file uploader zone with a dotted border.
  - **Supporting Panel 3 (8/12 width, wide):** Occupies the bottom-right area. Renders search query telemetry and statistics charts.

### Document Library Screen (PDF & Images)
- **Composition & Layout:** 2-column split-pane master-detail workspace.
- **Layout Structure:**
  - **Background Typography:** Giant `"RECORDS"` stenciled in background.
  - **Left Master List Pane (40% width):** A dense table listing uploaded PDF and image files. Columns include file type icon, name, file size, status badge (`[READY]`, `[PROCESSING]`), and upload timestamp.
  - **Right Detail Panel Pane (60% width):** Large Document Preview area. Selecting a file on the left populates the right panel with its summary, tag clouds, extracted text snippet matches, and action triggers (Download, Delete).

### AI Grounded Chat Screen
- **Composition & Layout:** Three-pane collapsible workspace.
- **Layout Structure:**
  - **Background Typography:** Giant `"COGNITION"` stenciled in background.
  - **Left Sidebar (Collapsible):** Thread list sidebar. Collapses into a minimal rail to maximize conversation space.
  - **Center Pane (Main chat):** Message bubbles aligned in a fixed-width central container (max 800px) for optimal legibility.
  - **Right Sidebar (Expandable):** Dedicated slide-out Citations Sidebar displaying citation files, page numbers, confidence metrics, and context snippets for the selected AI response, keeping the conversation thread clean.

### Knowledge Graph Screen
- **Composition & Layout:** Full-pane canvas area.
- **Layout Structure:**
  - **Background Typography:** Giant `"CONNECTOME"` stenciled in background.
  - **Top Controls Bar:** Floating controls header bar containing tag visibility toggles, search filters, and min similarity threshold sliders.
  - **Main Canvas:** Full screen force-directed graph rendering pulsing mint-green file nodes and white topic nodes connected by thin mint lines.

### Settings Screen
- **Composition & Layout:** Two-pane settings control sheet.
- **Layout Structure:**
  - **Background Typography:** Giant `"CONTROL"` stenciled in background.
  - **Left Navigation Sidebar:** Vertical navigation tabs for settings groups: Appearance, Account, and data preferences.
  - **Right Preferences Sheet:** Frosted forms with inputs (password change, theme selectors, email info) and logout triggers.

---

## 4. "Do Not Break" Core Integration Contracts

> [!IMPORTANT]
> The following core functionalities, integration layers, stores, and API clients must survive the visual rebuild completely intact:
>
> 1. **JWT Authentication Flow:** Protected route wrappers (`<ProtectedRoute>` in `App.tsx`) and authorization headers logic.
> 2. **API Clients (`src/services/api.ts`):** Endpoint configurations and payload mapping structures.
> 3. **Zustand Stores (`src/store/`):**
>    - `authStore.ts` (access token, credentials status, login/register/logout actions).
>    - `chatStore.ts` (current conversation sessions, streaming messages, reference citations).
>    - `themeStore.ts` (dark/light theme mechanism, synced with the document's class list).
> 4. **Knowledge Graph Canvas:** ForceGraph calculation logic, window resizing handlers, and active node events.
> 5. **File Upload & Syncing:** Background polling loops that monitor the document state until transition out of `processing` to `ready`/`failed`.
