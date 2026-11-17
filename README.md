# Conflict Economy Ventures 2040 — 3D Tycoon & Multiplayer Strategy Simulation

**Version 3.0** — An educational, satirical, host-controlled multiplayer game for conflict-economy and mediation discussions.

This is a complete Node.js + Express + Socket.IO web application with a Three.js holographic tabletop on the host screen and a lightweight optional 3D emblem on phones. It preserves the QR-code lobby, player reconnection, custom team counts and private moderator access.

## Quick start (locally)

Requirements: Node.js **20 or newer**, an internet connection for the first `npm install`, and (for the optional 3D layer) access to the pinned Three.js CDN.

```bash
npm install
npm start
```

Visit **http://localhost:3000/host.html**. Click **Create multiplayer room**. A six-character code and QR appear. Players use **http://localhost:3000/player.html?room=ABC123** (replace with the actual code). Phones on the same Wi-Fi cannot connect to *your own computer's* `localhost`; use your computer's LAN IP, e.g. `http://192.168.1.20:3000/host.html`, or deploy to Render for internet play. Your firewall must allow the port.

## Deploy to GitHub + Render

**This downloadable ZIP has `server.js`, `package.json`, `public/`, etc. directly at its root, not inside an extra wrapper folder.** This avoids the `ENOENT package.json` error that appeared in a previous deployment.

1. Extract the entire ZIP. **Upload the extracted contents**, including folders (`public`, `tests`, `.github`) to the root of a new GitHub repository. GitHub Desktop is recommended for preserving directories.
2. Confirm the repository's main page shows `server.js`, `game-data.js`, `package.json`, `render.yaml`, `public/`, `tests/` and `README.md` at the same level.
3. Open [dashboard.render.com](https://dashboard.render.com/), choose **New → Web Service** and connect this repository. Choose **Node**, the `main` branch, and the region you prefer.
4. **Root Directory: leave blank** when these files are in the repository root. If you accidentally uploaded a parent folder, either move its contents to root or set Root Directory to that exact folder name.
5. **Build Command:** `npm install` · **Start Command:** `npm start` · **Health Check Path:** `/api/health` · **Instance:** Free if available.
6. Deploy. Once Render says **Live**, visit `https://YOUR-SERVICE.onrender.com/host.html`. It should open a working host console. `.../api/health` should return `{"ok":true,...}`.
7. Create a new room and have several devices join through the QR. **Never use an old room code after a server restart**, unless using an appropriately configured persistent store.

The included `render.yaml` can also be used with Render Blueprint deployment. Render sets the `PORT` environment variable automatically. The server listens on `0.0.0.0`.

## How to run a game

1. **Lobby:** Main host creates a room. Choose team count **1–32** and **Quick (3 rounds)** or **Full (5 rounds)**. Players join and select avatars. Main host may copy a **private moderator link** for co-hosts; ordinary room links do not grant host powers.
2. **Assign teams:** Everyone is randomly and approximately evenly allocated. *All player phones immediately receive the shared 2040 story, a private faction card, a secret mandate, and their starting resources.* Every participant presses **Briefing Complete**; the host sees readiness live. The host may force-start when someone cannot mark ready.
3. **Rounds:** Every phone shows the same round title but a **resource-specific scenario**, three choices and the likely trade-offs. Teams discuss; any teammate can lock the team's one decision. Host sees submitted/awaiting indicators without the answers.
4. **Reveal:** The first of (a) all teams submitting, (b) timer expiry, or (c) host clicking Reveal unlocks outcomes together. The server applies consequences, then pays *passive income* if the workforce is not on strike. Result screens and rankings synchronize immediately.
5. **Strike resolution:** When morale drops below **35/100**, the team strikes and earns **zero passive income**. During the next active round, any teammate can make a wage settlement (spend **$0.35B**, +28 morale, +1 stability) or initiate mediation (spend **2 influence stars**, +20 morale, +2 stability). A strike ends once morale is at least **45** at negotiation time or **48** at reveal.
6. **Defections:** If morale falls below **25** at reveal, some employees quit or move to a higher-morale rival. Their headcount is removed from the original team and may be added to the rival.
7. **Diplomacy (Full mode, Round 4):** Each team can send **one private offer**: a trade agreement, an alliance, or a unilateral recruitment bid. Recipient teams may accept/decline trade and alliance invitations; poaching remains private. Deals settle at reveal if the required resources are available.
8. **Summit (Round 5 or Quick Round 3):** Civil society participation, revenue governance and negotiated oversight determine the final portfolio. End titles are satirical archetypes (e.g., People's Champion, Shadow Oligarch, Sweatshop Warlord).
9. **Host/Moderators:** Everyone with a private moderator invitation can rate Profit, Organizational Survival, and Market Power **independently** on a 0–5 scale. The server averages individual ratings. Only the owner controls progression, reveals, resets, or timing.

**Quick mode order:** Seed & Recruitment → Black Swan & Civil Unrest → The 2040 Peace Summit.  
**Full mode order:** Seed & Recruitment → Supply Chain & Labor → Black Swan → Backchannel Diplomacy & Poaching → 2040 Peace Summit.

## Resources and simulated economics

All numerical values are **fictional gameplay units**, not estimates of real armed groups or real mining/oil enterprises.

| Resource | Meaning | How it changes |
| --- | --- | --- |
| Venture Capital ($B) | Available fictional cash | Investment decisions, income, transfers, wages |
| Workforce (people) | Skilled workers and local staff | Recruitment, resignation, poaching, workplace policy |
| Political Influence (★) | Access, bargaining and legitimacy resources | Negotiations, deals, commitments |
| Regional Stability (🛡) | Public trust and operating environment | Social settlement, labor relations, crises |
| Intel / Tech (◈) | Information and advanced capability | Technology investments, training and audits |
| Morale / Legitimacy (0–100) | People's willingness to support operations | Wage policy, grievances, participation, extraction |

At **6+ Intel nodes**, the team receives a private early-warning brief and unlocks an additional advanced action in later rounds. **Stability at 2 or below** triggers a regional crisis and reduces income; noninclusive choices during the Black Swan and final Summit phases can also trigger citizen-coalition sanctions.

The server—not phones—holds and updates all balances. At each reveal it applies decisions, resolves accepted deals, simulates defections and strikes, then credits passive income to active teams. Unsubmitted choices receive a disadvantage so abstention cannot reliably beat a costly substantive choice. A team score combines all resource holdings plus averaged VC ratings.

## Visuals

- The host board is a real Three.js scene assembled from 3D geometry: four distinct regional asset types, animated convoys, infrastructure towers that grow with capital, colored team labels, and protest crowds which appear during strikes. Drag to orbit, use the mouse wheel to zoom, click a team hub to inspect it.
- Supports custom team counts: additional teams are organized on a scaled tabletop grid rather than overlapping the original four hubs.
- Player screens use smaller Three.js emblems without a full map.
- The interactive 3D scene requires WebGL and an internet connection to load `three@0.180.0` from jsDelivr. **If CDN access or WebGL fails, gameplay remains functional** and the included high-quality 2040 city artwork is shown as a static fallback.
- The animation loop targets ~30fps on the host and ~22fps on mobile, caps pixel ratio, respects reduced-motion preferences and suspends rendering in background tabs.

## Tests

```bash
npm test
```

Tests verify the five-round data, distinct scenarios, room assignments, synchronized briefings, private mandates, authoritative decision processing, compounding income, labor strikes and wage settlement, diplomatic offers, moderator rating, and Quick mode progression. These tests use lightweight test doubles so the core protocol tests can be run in constrained CI. A genuine multi-phone Socket.IO test is still recommended on your deployed service before a live event.

## Operational and privacy notes

- Room state and secrets are held in **server memory** for the default Render configuration. On a free Render service, a restart/spin-down will erase rooms and progress. *“Persistent resources” here means persistent throughout the running game's rounds, not durable cloud storage across restarts.*
- To keep a local snapshot through local server restarts, set `SAVE_FILE=./data/rooms.json` (see `.env.example`). This uses local filesystem writes and is **not durable on Render Free**. For production persistence across restarts, use a managed persistent database or Redis plus appropriate migration and backup planning.
- Main-host access uses a random secret stored in the creating browser's localStorage; moderator access uses a separate private invitation fragment. Keep moderation links private. The room code alone does not authorize host actions.
- Joining after the game starts requires a saved player token (reconnection). Team choices and private faction profiles are never sent to other teams before result reveal; only participants in a diplomatic offer see its terms.
- An ordinary browser reload reconnects when the same browser still has its credentials; using Private Browsing or clearing browser storage discards access.
- Do not enter real classified information, sensitive participant details, or actual organizational plans. This is an educational game.

## Project structure

```
server.js                 Express, Socket.IO, game engine, authoritative state
package.json              Build and start commands
render.yaml               Render Blueprint
 game-data.js             Fictional 2040 story, faction briefs, 5-round options
public/
  host.html / host.js       Host dashboard and game controls
  player.html / player.js   Mobile player interface, decisions and negotiations
  common.js / styles.css   Shared UI utilities and responsive styling
  world3d.js               Three.js dynamic CDN loader and 3D simulation
  assets/2040-territory.webp  High-quality static fallback map
 tests/                   Game-data and simulated multiplayer protocol tests
screenshots/              Preview screenshots
```

### Troubleshooting

- **Render `npm ERR! ENOENT /opt/render/project/src/package.json`:** GitHub files are nested in a subfolder while Root Directory is blank. Either set Render Root Directory to the actual folder name or upload the *contents* at repo root.
- **Render reports a 404 for `/host.html`:** Confirm that GitHub contains `public/host.html` and that Root Directory points to the directory with `server.js`.
- **Host page visible but player QR cannot join:** Check `/api/health`, whether the room was recreated after a restart, phone network access, and WebSocket connectivity.
- **3D scene not showing:** Check browser console for the CDN or WebGL. The game remains playable using the background artwork. Test Chrome, Edge, or Firefox with hardware acceleration.
- **Round advances unexpectedly:** The host reveals after the last submission; its timer also reveals when expired. Use the **+60 seconds** button before time is up.
- **Free Render cold start:** Keep the URL open and create a fresh room just before the event. For reliable long events, consider a paid instance and persistent backing store.
