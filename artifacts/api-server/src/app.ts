import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Root status page — lets Replit verify the deployment is alive
app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CopiEX Bot — Online</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #23272a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #2c2f33; border-radius: 12px; padding: 40px 48px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.4); }
    .dot { display: inline-block; width: 12px; height: 12px; background: #43b581; border-radius: 50%; margin-right: 8px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    h1 { font-size: 2rem; margin: 0 0 8px; }
    p { color: #99aab5; margin: 0 0 24px; }
    .commands { list-style: none; padding: 0; margin: 0; text-align: left; }
    .commands li { background: #23272a; border-radius: 6px; padding: 8px 14px; margin: 6px 0; font-size: 0.9rem; color: #7289da; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <h1><span class="dot"></span>CopiEX Bot</h1>
    <p>Discord server clone bot — running 24/7</p>
    <ul class="commands">
      <li>/copy-server name:&lt;label&gt;</li>
      <li>/import-server name:&lt;label&gt; confirm:CONFIRM</li>
      <li>/delete-snapshot name:&lt;label&gt;</li>
    </ul>
  </div>
</body>
</html>`);
});

export default app;
