import { createRoot } from "react-dom/client";
import CrmStandaloneApp from "./App";
import "@fontsource-variable/plus-jakarta-sans";
import "./index.css";
import { installGlobalErrorLogger } from "./lib/error-logger";

// Entrada do VERT CRM.
installGlobalErrorLogger();

createRoot(document.getElementById("root")!).render(<CrmStandaloneApp />);
