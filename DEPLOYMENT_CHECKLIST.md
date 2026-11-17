# Quick deployment checklist — GitHub → Render

- [ ] ZIP is extracted, not uploaded as a ZIP.
- [ ] Repository root shows `package.json`, `server.js`, `game-data.js`, `render.yaml`, `public/`.
- [ ] `public/host.html`, `public/player.html`, `public/world3d.js`, and `public/assets/2040-territory.webp` exist.
- [ ] Render service type: **Web Service**. Runtime: **Node**. Branch: **main**.
- [ ] Render **Root Directory**: blank **if files are at repository root**. If nested, use the precise subfolder.
- [ ] Build Command: `npm install`.
- [ ] Start Command: `npm start`.
- [ ] Health Check Path: `/api/health`.
- [ ] Render deployment says **Live**.
- [ ] `https://YOUR-SERVICE.onrender.com/api/health` returns `ok: true`.
- [ ] Host creates a **fresh** room. Two phones join from the QR.
- [ ] Host assigns teams; each phone sees **2040 story + private faction mandate**.
- [ ] Both phones tap Briefing Complete. Host sees readiness counts.
- [ ] Host starts Round 1; phones see their options; host sees submission ticks.
- [ ] Both teams submit; outcomes arrive at the same time; balances change.
- [ ] Try Quick and Full modes in *separate fresh games*.

**Important:** Render free instances may restart or sleep. Default room state resides in RAM and can disappear. Keep the old production game as a fallback until your new test session passes.
