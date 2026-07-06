# Fast Route

Real-time delivery **route optimization** (web + installable PWA). Add delivery
stops on a map and the app recomputes the driver's optimal visiting order,
minimizing time and fuel.

Built with Next.js 16 (App Router), MapLibre GL + OpenFreeMap (free, no key),
and OpenRouteService for optimization. Designed to deploy on Vercel.

## Architecture

Domain-oriented ("screaming") structure — the folders announce the problem:

```
src/
  app/
    api/optimize/route.ts        # Server endpoint: keeps the ORS key secret
    page.tsx                     # Renders the planner
    manifest.ts                  # PWA manifest
  features/routing/
    domain/types.ts              # Core model: Coordinate, Stop, Vehicle, Route
    services/openrouteservice.ts # Talks to ORS (server-only)
    hooks/useRoutePlanner.ts     # State + debounced auto re-optimization
    components/                  # RouteMap, StopList, RoutePlanner
    lib/geo.ts                   # Polyline decode + formatting
```

The API key lives **only** on the server. The browser never sees it.

## Setup

1. Get a free OpenRouteService key at https://openrouteservice.org/dev
2. Create a file named `.env.local` in the project root with:

   ```
   ORS_API_KEY=your_key_here
   ```

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open http://localhost:3000
   - Click the map once to place the **driver** (🚚).
   - Click again to add **delivery stops** (📍).
   - The optimal route and total time/distance update automatically.

## Deploy to Vercel

```bash
npm i -g vercel   # if not installed
vercel            # first run links the project
```

Add `ORS_API_KEY` in the Vercel project (Settings → Environment Variables, or
`vercel env add ORS_API_KEY`), then `vercel --prod`.

## Roadmap (next slices)

This is the **routing core**. Planned modules to build around it: persistence &
real-time sync (Supabase), customers, products, orders, sales, inventory,
users/roles, finances, and analytics.
