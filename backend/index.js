// src/server/index.js
import Koa from "koa";
import websocket from "koa-websocket";
import Router from "koa-router";
import bodyParser from "koa-bodyparser";

import { HifiBerryAdapter } from "./adapters/HifiberryAdapter.js";

// Initialize Koa with websocket support
const app = websocket(new Koa());
const router = new Router();
const wsRouter = new Router();
const adapter = new HifiBerryAdapter();

// Track connected clients for broadcasting
const clients = new Set();

// Middleware for error handling
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = { error: err.message };
    ctx.app.emit("error", err, ctx);
  }
});

app.use(bodyParser());

// REST Routes
router.get("/api/status", async (ctx) => {
  ctx.body = await adapter.getStatus();
});

router.get("/api/volume", async (ctx) => {
  const volume = await adapter.getVolume();
  ctx.body = { volume };
});

router.post("/api/volume", async (ctx) => {
  const { volume } = ctx.request.body;
  if (typeof volume !== "number" || volume < 0 || volume > 100) {
    ctx.status = 400;
    ctx.body = { error: "Volume must be a number between 0 and 100" };
    return;
  }

  await adapter.setVolume(volume);
  ctx.body = { volume };

  // Broadcast volume change to all connected clients
  broadcastToAll({
    type: "VOLUME_CHANGED",
    payload: { volume },
  });
});

router.post("/api/player/play", async (ctx) => {
  await adapter.play();
  ctx.body = { status: "playing" };

  broadcastToAll({
    type: "PLAYBACK_CHANGED",
    payload: { status: "playing" },
  });
});

router.post("/api/player/pause", async (ctx) => {
  await adapter.pause();
  ctx.body = { status: "paused" };

  broadcastToAll({
    type: "PLAYBACK_CHANGED",
    payload: { status: "paused" },
  });
});

// WebSocket handling
wsRouter.get("/ws", (ctx) => {
  clients.add(ctx.websocket);

  // Send initial state
  sendState(ctx.websocket);

  ctx.websocket.on("message", async (message) => {
    try {
      const { type, payload } = JSON.parse(message);

      switch (type) {
        case "SET_VOLUME":
          await handleVolume(payload);
          break;

        case "PLAYBACK_CONTROL":
          await handlePlayback(payload);
          break;

        case "GET_STATE":
          await sendState(ctx.websocket);
          break;

        default:
          ctx.websocket.send(
            JSON.stringify({
              type: "ERROR",
              payload: { message: "Unknown command" },
            })
          );
      }
    } catch (error) {
      ctx.websocket.send(
        JSON.stringify({
          type: "ERROR",
          payload: { message: error.message },
        })
      );
    }
  });

  // Clean up on disconnect
  ctx.websocket.on("close", () => {
    clients.delete(ctx.websocket);
  });
});

// Helper functions
async function handleVolume(payload) {
  const { volume } = payload;
  await adapter.setVolume(volume);
  broadcastToAll({
    type: "VOLUME_CHANGED",
    payload: { volume },
  });
}

async function handlePlayback(payload) {
  const { command } = payload;
  switch (command) {
    case "PLAY":
      await adapter.play();
      broadcastToAll({
        type: "PLAYBACK_CHANGED",
        payload: { status: "playing" },
      });
      break;

    case "PAUSE":
      await adapter.pause();
      broadcastToAll({
        type: "PLAYBACK_CHANGED",
        payload: { status: "paused" },
      });
      break;
  }
}

async function sendState(client) {
  const [volume, status] = await Promise.all([
    adapter.getVolume(),
    adapter.getStatus(),
  ]);

  client.send(
    JSON.stringify({
      type: "STATE_UPDATE",
      payload: { volume, ...status },
    })
  );
}

function broadcastToAll(message) {
  const messageString = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) {
      // OPEN
      client.send(messageString);
    }
  }
}

// Apply middleware and routes
app.use(router.routes());
app.use(router.allowedMethods());
app.ws.use(wsRouter.routes());

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket message types reference for clients
const WS_MESSAGE_TYPES = {
  // Client -> Server
  SET_VOLUME: "SET_VOLUME", // { volume: number }
  PLAYBACK_CONTROL: "PLAYBACK_CONTROL", // { command: 'PLAY' | 'PAUSE' }
  GET_STATE: "GET_STATE", // {}

  // Server -> Client
  STATE_UPDATE: "STATE_UPDATE", // { volume: number, status: string, ... }
  VOLUME_CHANGED: "VOLUME_CHANGED", // { volume: number }
  PLAYBACK_CHANGED: "PLAYBACK_CHANGED", // { status: string }
  ERROR: "ERROR", // { message: string }
};

// expose these for use in the frontend under a route like /api/ws
router.get("/api/ws", (ctx) => {
  ctx.websocket.send(JSON.stringify(WS_MESSAGE_TYPES));
});