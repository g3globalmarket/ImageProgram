import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getProducts, runImport, getImportRuns, enrichImagesBatch } from "../api/products";
import type { ProductDTO, ImportRunRequest, ImportRunDTO } from "@repo/shared";
import ImportForm from "../components/ImportForm";
import "./ProductList.css";

function ProductList() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [showImportForm, setShowImportForm] = useState(false);
  const [importRuns, setImportRuns] = useState<ImportRunDTO[]>([]);
  const [filters, setFilters] = useState<{
    store?: string;
    categoryKey?: string;
    topCategory?: string;
    subCategory?: string;
  }>({});
  const [enriching, setEnriching] = useState(false);

  const fetchProducts = async (page = 1, currentFilters = filters) => {
    try {
      setLoading(true);
      setError(null);
      const response = await getProducts({ 
        page, 
        limit: 20,
        ...currentFilters,
      });
      setProducts(response.data);
      setPagination(response.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch products");
      setProducts([]); // Clear products on error - no fake data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleImport = async (data: ImportRunRequest) => {
    try {
      const result = await runImport(data);
      setShowImportForm(false);
      
      // Check if this was a staged import
      const response = result as any;
      if (response.staged && response.staged.stagedCount > 0) {
        // Navigate to staged products list
        alert(`Staged import complete: ${response.staged.stagedCount} products staged. Redirecting to Staged Products...`);
        navigate("/staged-products");
      } else {
        // Regular import - update filters and refetch
        const newFilters = {
          store: data.store,
          categoryKey: data.categoryKey,
        };
        setFilters(newFilters);
        await fetchProducts(1, newFilters);
        await fetchImportRuns();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import failed");
    }
  };

  const handleEnrichImages = async (store?: string) => {
    try {
      setEnriching(true);
      const result = await enrichImagesBatch({
        store,
        limit: 20,
        desiredCount: 5,
        force: false,
      });
      alert(
        `Image enrichment complete:\n` +
        `- Matched: ${result.matched}\n` +
        `- Enriched: ${result.enriched}\n` +
        `- Skipped: ${result.skipped}\n` +
        `- Failed: ${result.failed}`
      );
      // Refetch products to show new images
      await fetchProducts(pagination.page, filters);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Image enrichment failed");
    } finally {
      setEnriching(false);
    }
  };

  const fetchImportRuns = async () => {
    try {
      const response = await getImportRuns({ page: 1, limit: 10 });
      setImportRuns(response.data);
    } catch (err) {
      // Silently fail - import runs are not critical
      console.error("Failed to fetch import runs:", err);
    }
  };

  useEffect(() => {
    fetchImportRuns();
  }, []);

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: currency,
    }).format(price);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      imported: "#3498db",
      translated: "#9b59b6",
      images_updated: "#f39c12",
      ready: "#27ae60",
      error: "#e74c3c",
    };
    return colors[status] || "#95a5a6";
  };

  return (
    <div className="product-list">
      <div className="product-list-header">
        <h2>Products</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleEnrichImages(filters.store)}
            disabled={enriching}
          >
            {enriching ? "Enriching..." : "Enrich Images"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowImportForm(!showImportForm)}
          >
            {showImportForm ? "Cancel" : "Run Import"}
          </button>
        </div>
      </div>

      {showImportForm && (
        <div className="import-form-container">
          <ImportForm onSubmit={handleImport} />
        </div>
      )}

      {importRuns.length > 0 && (
        <div className="import-runs-panel">
          <h3>Recent Import Runs</h3>
          <table className="import-runs-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Store</th>
                <th>Category</th>
                <th>Inserted</th>
                <th>Updated</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {importRuns.map((run) => (
                <tr key={run.id}>
                  <td>{new Date(run.startedAt).toLocaleString()}</td>
                  <td>{run.store}</td>
                  <td>{run.categoryKey}</td>
                  <td>{run.inserted}</td>
                  <td>{run.updated}</td>
                  <td>{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading products...</div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <p>No products found. Run an import to get started.</p>
        </div>
      ) : (
        <>
          <div className="products-grid">
            {products.map((product) => {
              // Get thumbnail URL: prefer processed, then original, then placeholder
              // If processed URL is relative (starts with /), prepend API base URL
              const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001";
              let thumbUrl =
                product.imagesProcessed?.[0] ||
                product.imagesOriginal?.[0] ||
                null;
              
              // If thumbUrl is relative (starts with /), make it absolute
              if (thumbUrl && thumbUrl.startsWith("/") && !thumbUrl.startsWith("//")) {
                thumbUrl = `${apiBase}${thumbUrl}`;
              }

              return (
                <Link
                  key={product.id}
                  to={`/products/${product.id}`}
                  className="product-card"
                >
                  <div className="product-card-header">
                    <span
                      className="product-status"
                      style={{ backgroundColor: getStatusColor(product.status) }}
                    >
                      {product.status}
                    </span>
                    <span className="product-store">{product.store}</span>
                  </div>
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={product.title}
                      className="product-thumbnail"
                      loading="lazy"
                      onError={(e) => {
                        // Fallback to placeholder on error
                        const target = e.target as HTMLImageElement;
                        target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23ddd' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3ENo image%3C/text%3E%3C/svg%3E";
                      }}
                    />
                  ) : (
                    <div className="product-thumbnail-placeholder">
                      <span>No image</span>
                    </div>
                  )}
                  <h3 className="product-title">
                    {product.titleMn || product.title}
                  </h3>
                  {product.titleMn && product.title && product.title !== product.titleMn && (
                    <div className="product-subtitle" style={{ fontSize: "0.75rem", color: "#999", marginTop: "0.25rem", fontStyle: "italic" }}>
                      {product.title}
                    </div>
                  )}
                  <div className="product-price">
                    {formatPrice(product.price, product.currency)}
                  </div>
                  <div className="product-meta">
                    <span>Category: {product.categoryKey}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="pagination">
            <button
              disabled={pagination.page === 1}
              onClick={() => fetchProducts(pagination.page - 1)}
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchProducts(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ProductList;

