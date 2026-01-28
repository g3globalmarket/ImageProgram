import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import ProductList from "./pages/ProductList";
import ProductDetail from "./pages/ProductDetail";
import StagedProductsList from "./pages/StagedProductsList";
import StagedProductDetail from "./pages/StagedProductDetail";
import { getDemoStatus } from "./api/products";
import "./App.css";

function App() {
  const [demoMode, setDemoMode] = useState<{ mode: string; loaded: boolean } | null>(null);

  useEffect(() => {
    getDemoStatus()
      .then((status) => {
        if (status.mode === "demo") {
          setDemoMode({ mode: status.mode, loaded: status.loaded });
        }
      })
      .catch(() => {
        // Ignore errors, just don't show badge
      });
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <h1>Korean Products Manager</h1>
          {demoMode && demoMode.mode === "demo" && (
            <span className="demo-badge" title="Demo Mode: Loading products from local JSON file">
              DEMO MODE (local JSON)
            </span>
          )}
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<ProductList />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/staged-products" element={<StagedProductsList />} />
            <Route path="/staged-products/:id" element={<StagedProductDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

