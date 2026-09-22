import React from "react";
import ReactDOM from "react-dom/client";
import "../i18n"; // shared locale bundles (overlay uses t() too)
import OverlayApp from "./OverlayApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><OverlayApp /></React.StrictMode>
);
