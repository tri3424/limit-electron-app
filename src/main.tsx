import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installProductionNetworkGuard } from "./lib/networkGuard";

installProductionNetworkGuard();

createRoot(document.getElementById("root")!).render(
  <App />
);
