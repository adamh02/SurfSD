import { createApp } from "./app.js";
import { config } from "./config.js";

// This file starts the app. createApp() builds the server, and listen() opens the
// local web address.
const app = createApp();
const host = process.env.HOST || "127.0.0.1";

// If the port is already taken, print a clear message instead of failing silently.
app.on("error", (error) => {
  console.error(`SurfSD failed to start: ${error.message}`);
  process.exitCode = 1;
});

// Starts the web server.
app.listen(config.port, host, () => {
  console.log(`SurfSD running at http://${host}:${config.port}`);
});
