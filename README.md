<div align="center">
  <img src="public/surfsd-logo.png" alt="SurfSD logo" style="width: 130px;">

  # SurfSD

  **A community-driven surf reporting platform for San Diego surfers.**
</div>

## About the Project

SurfSD is a full-stack web application I made to make local surf conditions more accessible. Surf cameras and forecast charts are helpful, but they do not always show what the waves actually look like from the beach. SurfSD lets local surfers share firsthand reports for spots across San Diego.

Users can explore surf spots on an interactive map, view current swell, tide, and weather information, create a community profile, and publish a report with wave height, an optional rating, a description, and an optional video. Surfers can also comment, reply, and follow report activity through public profiles.

This is an ongoing student project, so I am continuing to improve the design, data accuracy, uploads, and overall user experience.

### Surf Map

The map displays surf spots from North County to the border. Each marker opens a popup with the spot name, difficulty, and a link to its page where you can make your own report.

![SurfSD map showing San Diego surf spots](docs/screenshots/map-overview.png)

![SurfSD selected map marker](docs/screenshots/map-marker.png)

### Surf Spot

Each spot has its own page with a local image, description, difficulty, and spot specific swell, tide, and weather conditions.

![Little Point and Rockpile surf spot page](docs/screenshots/spot-details.png)

### Reports

Users with an account can publish condition reports. Reports include wave height, a description, an optional 1–10 rating, an optional video, the author, and a relative timestamp.

![Example SurfSD community report](docs/screenshots/recent-report.png)

### User Accounts

Users can sign up, log in with an email or username, add a profile photo, manage account settings, view report history, and open a public community profile.

![SurfSD account page with email redacted](docs/screenshots/account-redacted.png)

## Features

- Interactive Leaflet map with custom surf spot markers
- Individual pages for surf spots across San Diego County
- Live swell data from a NOAA buoy
- Current tide height and rising, falling, or steady trend
- Hourly weather conditions from the National Weather Service
- Account signup, login, logout, and account overview
- Public profiles with profile photos, report totals, comment totals, and contributor badges
- Email-or-username login, password reset, and username changes with a 14-day cooldown
- Protected report creation for authenticated users
- Surf reports with descriptions and wave heights up to 100 feet
- Optional 1–10 ratings and MP4, WebM, or MOV videos
- Report editing within three hours and owner-controlled report deletion
- Collapsible comment threads with replies and owner-controlled comment deletion
- Relative timestamps such as "3 minutes ago"
- Responsive server-rendered interface with a side navigation drawer
- Automated tests for authentication, profiles, reports, comments, validation, pages, uploads, and tides

## What I Used

- **JavaScript** for the frontend and backend
- **Node.js 24** with a native HTTP server
- **HTML and CSS** for the user interface
- **SQLite** using Node's built-in SQLite module
- **Leaflet** and **OpenStreetMap** for the interactive map
- **NOAA NDBC** for swell readings
- **NOAA Tides & Currents** for tide data
- **National Weather Service API** for local weather
- **Node test runner** for automated testing

I intentionally built this project without a web framework to better understand routing, HTTP requests, cookies, form handling, validation, databases, and server rendered HTML.

## Security and Validation

- Passwords are salted and hashed with crypto.scrypt, plain text passwords are never stored.
- Session IDs are randomly generated and protected with HMAC signatures.
- Session cookies use HttpOnly and SameSite=Lax.
- Report creation routes require an authenticated user.
- Signup, login, and report form inputs are validated on the server.
- Video uploads are limited to MP4, WebM, and MOV files.
- Profile photos are limited to PNG, JPG, or WebP files up to 5 MB.
- Upload requests are limited to 50 MB.
- Secrets and local database files are excluded from Git with .gitignore.
- A Content Security Policy limits which external resources the browser can load.

## Running the Project Locally

### Requirements

- Node.js 24 or newer
- npm, which is included with most Node.js installations

### Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/adamh02/SurfSD.git
   cd SurfSD
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Replace the example SESSION_SECRET in .env with a long random value.

4. Load the environment variables and start the server:

   ```bash
   set -a
   source .env
   set +a
   npm start
   ```

5. Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

The SQLite database is created and seeded automatically the first time the application starts.

## Testing

Run the complete automated test suite with:

```bash
npm test
```

The tests cover:

- Signup and secure password hashing
- Account settings, public profiles, and profile photo uploads
- Surf spot page loading
- Local surf spot images
- Authentication requirements for reports
- Report creation, editing, and deletion permissions
- Comment threads, replies, deletion permissions, and confirmation prompts
- Optional videos and ratings
- Form validation
- Upload-size error handling
- Rising and falling tide calculations

## Structure

```text
SurfSD/
├── docs/screenshots/       # README screenshots
├── public/                 # CSS, map code, logos, spot images, and uploads
├── src/
│   ├── app.js              # Routes and request handlers
│   ├── auth.js             # Authentication and password hashing
│   ├── conditions.js       # Swell, tide, and weather API requests
│   ├── config.js           # Environment-based configuration
│   ├── db.js               # SQLite schema and database queries
│   ├── httpUtils.js        # Forms, uploads, responses, and static files
│   ├── seedSpots.js        # San Diego surf spot data
│   ├── server.js           # Server entry point
│   ├── session.js          # Signed session management
│   ├── validation.js       # Report validation
│   └── views.js            # Server rendered HTML pages
├── tests/                  # Automated application tests
├── .env.example            # Example environment variables
└── package.json            # Project scripts and Node version
```

## Current Limitations

- Uploaded videos are saved to local storage, which is intended for demonstrations rather than a large public platform.
- Sessions are stored in memory and reset when the server restarts.
- SQLite is a good fit for the current version but would need a production hosting plan for a larger application.
- Live conditions depend on external government APIs and may temporarily show as unavailable if sites are down.

## Future Improvements

- Move report media to secure cloud storage
- Store sessions in a persistent database
- Add report editing, deleting, and moderation
- Improve accessibility and mobile navigation
- Add more detailed forecasts and map zoom behavior
- Expand to surf communities outside San Diego

## What I Learned

This project helped me practice building a full stack application from the ground up. I learned how frontend pages connect to backend, how relational data is stored and queried, how authentication and signed cookies work, how to validate uploads safely, how to work with external APIs, and how automated tests help prevent old features from breaking while new ones are added.
