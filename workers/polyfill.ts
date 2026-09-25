import ws from "ws";
if (typeof global.WebSocket === "undefined") {
  (global as any).WebSocket = ws;
}
