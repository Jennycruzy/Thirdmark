import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App.js";

// Midnight.js ledger serialization currently expects the Node-compatible Buffer
// interface even when it runs in a browser wallet flow.
(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
