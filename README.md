## What is SurfSD?

SurfSD is a simple full stack San Diego surf report app. Most surfers want to see the active boots on ground surf report rather than looking on a cam that doesnt really show you whats going on that well, so on SurfSD surfers can browse a local spot map, create an account, and post current condition reports with a short description, wave height, optional rating, and optional image/video showing active live updated surf reports for all San Diego beaches.

## Stack

- Native Node.js HTTP server
- Native Node.js SQLite database
- Server rendered HTML templates
- Signed HTTP only session cookies
- Leaflet map via CDN
- Node's built in test runner

The current environment does not include `npm`, so I avoided external packages. Passwords are salted and hashed with Node's built-in `crypto.scrypt`.

## Run

```bash
cp .env.example .env
node src/server.js
```

Then open `http://localhost:3000`.

## Test

```bash
node --test
```

## Main Pages

- `/map`: Interactive local surf spot map. (New surf spots still being added).
- `/about`: Overview description of the purpose of SurfSD.
- `/account`: Signup, login, logout, and account view (still being worked on).
- `/spots/swamis`: Example of one of our surf spot pages.
- `/spots/:slug/reports/new`: Create report form.

## Data Models

- `users`: `id`, `name`, `email`, `passwordHash`, `createdAt`
- `surf_spots`: `id`, `name`, `slug`, `latitude`, `longitude`, `description`, `imageUrl`, `difficulty`, `createdAt`
- `reports`: `id`, `surfSpotId`, `userId`, `imageUrl`, `description`, `waveHeight`, `rating`, `createdAt`
