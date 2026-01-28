import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getProduct, patchProduct, suggestImages, applyImages, deleteImage } from "../api/products";
import type { ProductDTO } from "@repo/shared";
import type { ImageSuggestion } from "../api/products";
import "./ProductDetail.css";

function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<ProductDTO>>({});
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<ImageSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsCount, setSuggestionsCount] = useState(12);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ downloaded: number; failed: number } | null>(null);

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
        const data = await getProduct(id);
        setProduct(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch product");
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


  const handleFieldEdit = (field: keyof ProductDTO, value: unknown) => {
    setEditing((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!product || !id) return;

    try {
      setSaving(true);
      const updated = await patchProduct(id, editing);
      setProduct(updated);
      setEditing({});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="product-detail">
        <Link to="/" className="back-link">
          ← Back to List
        </Link>
        <div className="loading">Loading product...</div>
      </div>
    );
  }

  if (error || !id) {
    return (
      <div className="product-detail">
        <Link to="/" className="back-link">
          ← Back to List
        </Link>
        <div className="error-container">
          <div className="error-message">{error || "Missing product id"}</div>
          <Link to="/" className="btn btn-secondary">
            Back to List
          </Link>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="product-detail">
        <Link to="/" className="back-link">
          ← Back to List
        </Link>
        <div className="error-container">
          <div className="error-message">Product not found</div>
          <Link to="/" className="btn btn-secondary">
            Back to List
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="product-detail">
      <Link to="/" className="back-link">
        ← Back to List
      </Link>

      <div className="product-detail-content">
        {/* Product Summary */}
        <div className="product-section">
          <h2>Product Summary</h2>
          <dl className="product-summary">
            <dt>Title (Mongolian)</dt>
            <dd>
              {editing.titleMn !== undefined ? (
                <div>
                  <textarea
                    value={editing.titleMn as string}
                    onChange={(e) => handleFieldEdit("titleMn", e.target.value)}
                    className="edit-textarea"
                    rows={2}
                    maxLength={500}
                  />
                  <div className="edit-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={handleSave}
                      disabled={saving}
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
                  <span className="product-summary-title">{product.titleMn || product.title || "—"}</span>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => handleFieldEdit("titleMn", product.titleMn || "")}
                    style={{ marginLeft: "0.5rem" }}
                  >
                    Edit
                  </button>
                </div>
              )}
              {product.title && product.title !== product.titleMn && (
                <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.25rem", fontStyle: "italic" }}>
                  Original (Korean): {product.title}
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
                    onChange={(e) => handleFieldEdit("price", parseFloat(e.target.value) || 0)}
                    className="edit-input"
                    min="0"
                    step="0.01"
                  />
                  <div className="edit-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={handleSave}
                      disabled={saving}
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
                    onClick={() => handleFieldEdit("price", product.price)}
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
            
            {(product as any).topCategory && (
              <>
                <dt>Top Category</dt>
                <dd>{(product as any).topCategory}</dd>
              </>
            )}
            
            {(product as any).subCategory && (
              <>
                <dt>Sub Category</dt>
                <dd>{(product as any).subCategory}</dd>
              </>
            )}
            
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
            
            {product.createdAt && (
              <>
                <dt>Created</dt>
                <dd className="product-summary-date">
                  {new Date(product.createdAt).toLocaleString()}
                </dd>
              </>
            )}
            
            {product.updatedAt && (
              <>
                <dt>Updated</dt>
                <dd className="product-summary-date">
                  {new Date(product.updatedAt).toLocaleString()}
                </dd>
              </>
            )}
          </dl>
        </div>
        {/* Images Manager section */}
        <div className="product-section">
          <h2>Images</h2>
          
          {/* Current Images */}
          <div className="images-manager-current">
            <h3>Current Images</h3>
            {(() => {
              const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001";
              const normalizeImageUrl = (url: string) => {
                if (url && url.startsWith("/") && !url.startsWith("//")) {
                  return `${apiBase}${url}`;
                }
                return url;
              };
              
              const processedImages = (product.imagesProcessed || []).map(normalizeImageUrl);
              const originalImages = (product.imagesOriginal || []).map(normalizeImageUrl);
              
              if (processedImages.length === 0 && originalImages.length === 0) {
                return <div className="no-images-message">No images available</div>;
              }

              return (
                <div className="current-images-grid">
                  {processedImages.map((img, idx) => (
                    <div key={`processed-${idx}`} className="image-tile">
                      <img
                        src={img}
                        alt={`${product.title} ${idx + 1}`}
                        className="image-tile-img"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Crect fill='%23ddd' width='150' height='150'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3ENo image%3C/text%3E%3C/svg%3E";
                        }}
                      />
                      <button
                        className="image-delete-btn"
                        onClick={async () => {
                          if (!id) return;
                          try {
                            await deleteImage(id, product.imagesProcessed![idx]);
                            const updated = await getProduct(id);
                            setProduct(updated);
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "Failed to delete image");
                          }
                        }}
                        title="Delete image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {originalImages.map((img, idx) => (
                    <div key={`original-${idx}`} className="image-tile readonly">
                      <img
                        src={img}
                        alt={`${product.title} original ${idx + 1}`}
                        className="image-tile-img"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Crect fill='%23ddd' width='150' height='150'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3ENo image%3C/text%3E%3C/svg%3E";
                        }}
                      />
                      <span className="image-readonly-label">Original</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Image Suggestions */}
          <div className="images-manager-suggestions">
            <h3>Request Image Suggestions</h3>
            <div className="suggestions-controls">
              <label>
                Count:
                <input
                  type="number"
                  min="4"
                  max="30"
                  value={suggestionsCount}
                  onChange={(e) => setSuggestionsCount(Math.min(Math.max(parseInt(e.target.value, 10) || 12, 4), 30))}
                  disabled={suggestionsLoading}
                />
              </label>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  if (!id) return;
                  try {
                    setSuggestionsLoading(true);
                    setSuggestions([]);
                    setSelectedSuggestions(new Set());
                    setApplyResult(null);
                    const result = await suggestImages(id, suggestionsCount);
                    setSuggestions(result.suggestions);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Failed to fetch suggestions");
                  } finally {
                    setSuggestionsLoading(false);
                  }
                }}
                disabled={suggestionsLoading}
              >
                {suggestionsLoading ? "Requesting..." : "Request"}
              </button>
            </div>

            {suggestions.length > 0 && (
              <>
                <div className="suggestions-grid">
                  {suggestions.map((suggestion, idx) => {
                    const isSelected = selectedSuggestions.has(suggestion.url);
                    return (
                      <div
                        key={idx}
                        className={`suggestion-tile ${isSelected ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedSuggestions((prev) => {
                            const next = new Set(prev);
                            if (next.has(suggestion.url)) {
                              next.delete(suggestion.url);
                            } else {
                              next.add(suggestion.url);
                            }
                            return next;
                          });
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <img
                          src={suggestion.url}
                          alt={`Suggestion ${idx + 1}`}
                          className="suggestion-img"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Crect fill='%23ddd' width='150' height='150'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3ENo image%3C/text%3E%3C/svg%3E";
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="suggestions-actions">
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      if (!id || selectedSuggestions.size === 0) return;
                      try {
                        setApplying(true);
                        setApplyResult(null);
                        // Build payload as array of URLs from selected suggestions
                        const urls = suggestions
                          .filter((s) => selectedSuggestions.has(s.url))
                          .map((s) => s.url);
                        
                        console.log("APPLY urls count", urls.length, urls.slice(0, 3));
                        
                        const result = await applyImages(id, urls);
                        setApplyResult({ downloaded: result.downloaded, failed: result.failed });
                        
                        // Update product from API response
                        setProduct(result.product);
                        
                        // Clear selection and suggestions after success
                        setSelectedSuggestions(new Set());
                        setSuggestions([]);
                        
                        // Refetch product to ensure we have the latest state
                        if (id) {
                          try {
                            const refreshed = await getProduct(id);
                            setProduct(refreshed);
                          } catch (err) {
                            console.warn("Failed to refetch product:", err);
                            // Continue with result.product if refetch fails
                          }
                        }
                        
                        if (result.errors && result.errors.length > 0) {
                          console.warn("Some images failed to download:", result.errors);
                        }
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Failed to apply images");
                      } finally {
                        setApplying(false);
                      }
                    }}
                    disabled={applying || selectedSuggestions.size === 0}
                  >
                    {applying ? "Adding..." : `Add Selected (${selectedSuggestions.size})`}
                  </button>
                  {applyResult && (
                    <span className="apply-result">
                      Downloaded: {applyResult.downloaded}, Failed: {applyResult.failed}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="product-section">
          <h2>Basic Information</h2>
          <dl>
            <dt>Category</dt>
            <dd>{product.categoryKey}</dd>
            <dt>Source URL</dt>
            <dd>
              <a
                href={product.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {product.sourceUrl}
              </a>
            </dd>
            <dt>Language</dt>
            <dd>
              {product.langOriginal} → {product.langTranslated}
            </dd>
          </dl>
        </div>

        <div className="product-section">
          <h2>Description (Original)</h2>
          <p className="description-text">{product.descriptionOriginal}</p>
        </div>

        {product.descriptionTranslated && (
          <div className="product-section">
            <h2>Description (Translated)</h2>
            {editing.descriptionTranslated !== undefined ? (
              <div>
                <textarea
                  value={editing.descriptionTranslated as string}
                  onChange={(e) => handleFieldEdit("descriptionTranslated", e.target.value)}
                  className="edit-textarea"
                  rows={5}
                />
                <div className="edit-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={handleSave}
                    disabled={saving}
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
                <p className="description-text">{product.descriptionTranslated}</p>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => handleFieldEdit("descriptionTranslated", product.descriptionTranslated)}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        )}

        <div className="product-section">
          <h2>Notes</h2>
          {editing.notes !== undefined ? (
            <div>
              <textarea
                value={editing.notes as string}
                onChange={(e) => handleFieldEdit("notes", e.target.value)}
                className="edit-textarea"
                rows={3}
              />
              <div className="edit-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={handleSave}
                  disabled={saving}
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
              <p>{product.notes || "(no notes)"}</p>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => handleFieldEdit("notes", product.notes || "")}
              >
                Edit
              </button>
            </div>
          )}
        </div>

        <div className="product-section">
          <h2>Metadata</h2>
          <dl>
            <dt>Created</dt>
            <dd>{new Date(product.createdAt).toLocaleString()}</dd>
            <dt>Updated</dt>
            <dd>{new Date(product.updatedAt).toLocaleString()}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

export default ProductDetail;

