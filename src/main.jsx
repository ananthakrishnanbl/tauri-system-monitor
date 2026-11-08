import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// StrictMode is intentionally off: it double-mounts effects in dev, which would
// start/stop the Rust stream twice. The hook is also guarded against stale channels.
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
