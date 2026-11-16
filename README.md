# Negative Split

A marathon training plan that installs on an iPhone Home Screen and works offline.
The runner enters a goal time, race date, height, weight, current mileage and a recent race;
the app builds a week-by-week plan in miles with paces in min/mile.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page shell: tabs, sheets, metadata for installing |
| `styles.css` | All styling (light theme, coral accent, Poppins) |
| `engine.js` | Training engine: paces, weekly mileage, workouts, taper |
| `app.js` | Screens, gestures, setup form, saved runs |
| `sw.js` | Service worker: caches the app so it opens offline |
| `manifest.webmanifest`, `icons/` | Name and icons for the Home Screen |

No build step and no dependencies. Logged runs are saved in the browser on the phone (`localStorage`).

## Where the numbers come from

- **Paces**: Daniels & Gilbert VDOT equations from a recent race (or a week-2 5K time trial).
  Easy, marathon, threshold, interval and repetition paces, stepping up every 4 weeks.
- **Mileage**: up to 10% a week (7–8% for first marathon, BMI ≥ 27, age 50+ or under 18),
  a lighter week every 4th week, then a 2–3 week taper (Bosquet et al., 2007).
- **Fuel**: carb and protein amounts scaled to body weight (ACSM / Jeukendrup guidelines).

## Run it on your computer

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Put it on his phone

Service workers need HTTPS, so host it first. Any static host works; these are free:

- **Netlify Drop**: go to app.netlify.com/drop and drag this folder onto the page.
- **Vercel**: run `npx vercel` in this folder.
- **GitHub Pages**: push this folder to a repo and turn on Pages for the main branch.

On the iPhone, open the link in **Safari**, tap **Share → Add to Home Screen**.
It then opens full-screen like an app and works without a connection.

## Updating

After changing any file, bump `VERSION` in `sw.js` (for example `v1` → `v2`) and redeploy.
Phones pick up the new version the next time the app is opened with a connection.
