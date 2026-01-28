import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getStagedProducts } from "../api/products";
import type { StagedProductDTO } from "../api/products";
import "./StagedProductsList.css";

function StagedProductsList() {
  const [products, setProducts] = useState<StagedProductDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState<{
    store?: string;
    status?: string;
  }>({ status: "staged" });

  const fetchProducts = async (page = 1, currentFilters = filters) => {
    try {
      setLoading(true);
      setError(null);
      const response = await getStagedProducts({
        page,
        limit: 20,
        ...currentFilters,
      });
      setProducts(response.data);
      setPagination(response.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch staged products");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(1, filters);
  }, [filters]);

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: currency,
    }).format(price);
  };

  return (
    <div className="staged-products-list">
      <div className="staged-products-list-header">
        <h2>Staged Products</h2>
        <Link to="/" className="btn btn-secondary">
          Back to Products
        </Link>
      </div>

      {/* Filters */}
      <div className="filters">
        <select
          value={filters.status || "staged"}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="staged">Staged</option>
          <option value="published">Published</option>
        </select>
        <select
          value={filters.store || ""}
          onChange={(e) =>
            setFilters({ ...filters, store: e.target.value || undefined })
          }
        >
          <option value="">All Stores</option>
          <option value="oliveyoung">OliveYoung</option>
          <option value="gmarket">Gmarket</option>
          <option value="11st">11st</option>
        </select>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading staged products...</div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <p>No staged products found.</p>
        </div>
      ) : (
        <>
          <div className="products-grid">
            {products.map((product) => {
              const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001";
              let thumbUrl =
                product.imagesProcessed?.[0] ||
                product.imagesOriginal?.[0] ||
                null;

              if (thumbUrl && thumbUrl.startsWith("/") && !thumbUrl.startsWith("//")) {
                thumbUrl = `${apiBase}${thumbUrl}`;
              }

              return (
                <Link
                  key={product.id}
                  to={`/staged-products/${product.id}`}
                  className="product-card"
                >
                  <div className="product-card-header">
                    <span className="product-status" style={{ backgroundColor: product.status === "published" ? "#27ae60" : "#f39c12" }}>
                      {product.status}
                    </span>
                    <span className="product-store">{product.store}</span>
                  </div>
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={product.titleMn || product.titleKo}
                      className="product-thumbnail"
                      loading="lazy"
                      onError={(e) => {
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
                    {product.titleMn || product.titleKo}
                  </h3>
                  {product.titleMn && product.titleKo !== product.titleMn && (
                    <div className="product-subtitle">
                      {product.titleKo}
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
              onClick={() => fetchProducts(pagination.page - 1, filters)}
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchProducts(pagination.page + 1, filters)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default StagedProductsList;

