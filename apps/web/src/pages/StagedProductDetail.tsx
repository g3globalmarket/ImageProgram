import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getStagedProduct, publishStagedProduct } from "../api/products";
import type { StagedProductDTO } from "../api/products";
import "./StagedProductDetail.css";

function StagedProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<StagedProductDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState<Partial<StagedProductDTO>>({});

  useEffect(() => {
    if (!id) {
      setError("Missing product id");
      setLoading(false);
      return;
    }

    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getStagedProduct(id);
        setProduct(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch staged product");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: currency,
    }).format(price);
  };

  const handlePublish = async () => {
    if (!product || !id) return;

    if (!confirm("Publish this product to the main Products collection?")) {
      return;
    }

    try {
      setPublishing(true);
      const result = await publishStagedProduct(id);
      // Redirect to published product detail page
      navigate(`/products/${result.product.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to publish product");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="staged-product-detail">
        <Link to="/staged-products" className="back-link">
          ← Back to Staged Products
        </Link>
        <div className="loading">Loading staged product...</div>
      </div>
    );
  }

  if (error || !id) {
    return (
      <div className="staged-product-detail">
        <Link to="/staged-products" className="back-link">
          ← Back to Staged Products
        </Link>
        <div className="error-container">
          <div className="error-message">{error || "Missing product id"}</div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="staged-product-detail">
        <Link to="/staged-products" className="back-link">
          ← Back to Staged Products
        </Link>
        <div className="error-container">
          <div className="error-message">Staged product not found</div>
        </div>
      </div>
    );
  }

  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001";
  const normalizeImageUrl = (url: string) => {
    if (url && url.startsWith("/") && !url.startsWith("//")) {
      return `${apiBase}${url}`;
    }
    return url;
  };

  const processedImages = (product.imagesProcessed || []).map(normalizeImageUrl);
  const originalImages = (product.imagesOriginal || []).map(normalizeImageUrl);
  const allImages = [...processedImages, ...originalImages];

  return (
    <div className="staged-product-detail">
      <Link to="/staged-products" className="back-link">
        ← Back to Staged Products
      </Link>

      <div className="staged-product-detail-content">
        <div className="product-section">
          <h2>Product Information</h2>
          <dl className="product-summary">
            <dt>Title (Korean) - Read Only</dt>
            <dd>{product.titleKo || "—"}</dd>

            <dt>Title (Mongolian)</dt>
            <dd>
              {editing.titleMn !== undefined ? (
                <div>
                  <textarea
                    value={editing.titleMn as string}
                    onChange={(e) => setEditing({ ...editing, titleMn: e.target.value })}
                    className="edit-textarea"
                    rows={2}
                    maxLength={500}
                  />
                  <div className="edit-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={async () => {
                        // TODO: Add PATCH endpoint for staged products if needed
                        setEditing({});
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => setEditing({})}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="product-summary-title">
                    {product.titleMn || "—"}
                  </span>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setEditing({ titleMn: product.titleMn || "" })}
                    style={{ marginLeft: "0.5rem" }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </dd>

            <dt>Price</dt>
            <dd>
              {editing.price !== undefined ? (
                <div>
                  <input
                    type="number"
                    value={editing.price as number}
                    onChange={(e) => setEditing({ ...editing, price: parseFloat(e.target.value) || 0 })}
                    className="edit-input"
                    min="0"
                    step="0.01"
                  />
                  <div className="edit-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => setEditing({})}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => setEditing({})}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="product-summary-price">
                    {product.price != null
                      ? formatPrice(product.price, product.currency || "KRW")
                      : "—"}
                  </span>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setEditing({ price: product.price })}
                    style={{ marginLeft: "0.5rem" }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </dd>

            <dt>Store</dt>
            <dd>{product.store || "—"}</dd>

            <dt>Category</dt>
            <dd>{product.categoryKey || "—"}</dd>

            {product.topCategory && (
              <>
                <dt>Top Category</dt>
                <dd>{product.topCategory}</dd>
              </>
            )}

            {product.subCategory && (
              <>
                <dt>Sub Category</dt>
                <dd>{product.subCategory}</dd>
              </>
            )}

            <dt>Status</dt>
            <dd>
              <span
                className="product-status"
                style={{
                  backgroundColor: product.status === "published" ? "#27ae60" : "#f39c12",
                }}
              >
                {product.status}
              </span>
            </dd>

            <dt>Source URL</dt>
            <dd>
              {product.sourceUrl ? (
                <a
                  href={product.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="source-link"
                >
                  Open source
                </a>
              ) : (
                "—"
              )}
            </dd>
          </dl>
        </div>

        {/* Images */}
        <div className="product-section">
          <h2>Images</h2>
          {allImages.length === 0 ? (
            <div className="no-images-message">No images available</div>
          ) : (
            <div className="current-images-grid">
              {allImages.map((img, idx) => (
                <div key={idx} className="image-tile">
                  <img
                    src={img}
                    alt={`${product.titleMn || product.titleKo} ${idx + 1}`}
                    className="image-tile-img"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Crect fill='%23ddd' width='150' height='150'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3ENo image%3C/text%3E%3C/svg%3E";
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Publish Button */}
        {product.status === "staged" && (
          <div className="product-section">
            <h2>Publish to Products</h2>
            <p className="section-hint">
              Click the button below to publish this staged product to the main Products collection.
            </p>
            <button
              className="btn btn-primary btn-large"
              onClick={handlePublish}
              disabled={publishing}
            >
              {publishing ? "Publishing..." : "Upload to DB"}
            </button>
          </div>
        )}

        {product.status === "published" && (
          <div className="product-section">
            <div className="info-message">
              This product has already been published. Check the main Products list.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StagedProductDetail;

