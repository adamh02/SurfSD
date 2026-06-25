import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();
const host = process.env.HOST || "127.0.0.1";

app.on("error", (error) => {
  console.error(`SurfSD failed to start: ${error.message}`);
  process.exitCode = 1;
});

app.listen(config.port, host, () => {
  console.log(`SurfSD running at http://${host}:${config.port}`);
});
