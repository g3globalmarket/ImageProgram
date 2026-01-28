import { useState, useEffect } from "react";
import type { ImportRunRequest, Store, ImageMode } from "@repo/shared";
import { getStoresCatalog, getConfig, getCategories, type StoreCatalogItem, type ConfigResponse, type CategoriesResponse } from "../api/products";
import "./ImportForm.css";

interface ImportFormProps {
  onSubmit: (data: ImportRunRequest) => Promise<void>;
}

function ImportForm({ onSubmit }: ImportFormProps) {
  const [formData, setFormData] = useState<ImportRunRequest>({
    store: "gmarket",
    categoryKey: "",
    limit: 10,
    translateTo: "mn",
    imageMode: "none",
    includeDetails: false,
  });
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<StoreCatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [categories, setCategories] = useState<CategoriesResponse | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedTopCategory, setSelectedTopCategory] = useState<string>("");
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>("");

  // Fetch catalog and config on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setCatalogLoading(true);
        setCatalogError(null);
        
        // Fetch catalog and config in parallel
        const [catalogResponse, configResponse] = await Promise.all([
          getStoresCatalog(),
          getConfig().catch(() => null), // Don't fail if config fails
        ]);
        
        setCatalog(catalogResponse.stores);
        setConfig(configResponse);
        
        // Load categories for default store
        if (catalogResponse.stores.length > 0) {
          const defaultStore = catalogResponse.stores.find(s => s.key === formData.store) || catalogResponse.stores[0];
          await loadCategoriesForStore(defaultStore.key);
        }
      } catch (err) {
        setCatalogError(err instanceof Error ? err.message : "Failed to load catalog");
      } finally {
        setCatalogLoading(false);
      }
    };

    fetchData();
  }, []);

  // Load categories for a store
  const loadCategoriesForStore = async (store: string) => {
    try {
      setCategoriesLoading(true);
      const categoriesData = await getCategories(store);
      setCategories(categoriesData);
      
      // Set default categoryKey
      if (categoriesData.categoryKeys.length > 0) {
        setFormData(prev => ({
          ...prev,
          store: store as Store,
          categoryKey: categoriesData.categoryKeys[0],
        }));
      }
      
      // Set default topCategory/subCategory if available
      if (categoriesData.topCategories.length > 0) {
        const firstTop = categoriesData.topCategories[0];
        setSelectedTopCategory(firstTop.key);
        if (firstTop.subCategories.length > 0) {
          setSelectedSubCategory(firstTop.subCategories[0].key);
        } else {
          setSelectedSubCategory("");
        }
      } else {
        setSelectedTopCategory("");
        setSelectedSubCategory("");
      }
    } catch (err) {
      console.error("Failed to load categories:", err);
      setCategories(null);
    } finally {
      setCategoriesLoading(false);
    }
  };

  // Update category when store changes
  const handleStoreChange = async (store: Store) => {
    setSelectedTopCategory("");
    setSelectedSubCategory("");
    setFormData(prev => ({
      ...prev,
      store,
      categoryKey: "",
    }));
    await loadCategoriesForStore(store);
  };

  // Get available top categories from dynamic categories
  const availableTopCategories = categories?.topCategories || [];
  
  // Get available sub categories for selected top category
  const availableSubCategories = selectedTopCategory
    ? categories?.topCategories.find(tc => tc.key === selectedTopCategory)?.subCategories || []
    : [];

  // Filter categoryKeys based on selected top/sub category
  const filteredCategoryKeys = (() => {
    if (!categories) return [];
    
    if (!selectedTopCategory) {
      // No top category selected - return all categoryKeys
      return categories.categoryKeys;
    }
    
    const topCat = categories.topCategories.find(tc => tc.key === selectedTopCategory);
    if (!topCat) return [];
    
    if (!selectedSubCategory) {
      // Top category selected but no sub category - return all categoryKeys from this top category
      return topCat.subCategories.flatMap(sc => sc.categoryKeys);
    }
    
    // Both top and sub category selected - return categoryKeys from this sub category
    const subCat = topCat.subCategories.find(sc => sc.key === selectedSubCategory);
    return subCat?.categoryKeys || [];
  })();

  // Update categoryKey when top/sub category changes
  useEffect(() => {
    if (filteredCategoryKeys.length > 0) {
      // If current categoryKey is not in filtered list, set to first available
      if (!formData.categoryKey || !filteredCategoryKeys.includes(formData.categoryKey)) {
        setFormData(prev => ({ ...prev, categoryKey: filteredCategoryKeys[0] }));
      }
    } else if (categories && categories.categoryKeys.length > 0) {
      // Fallback to first available categoryKey
      setFormData(prev => ({ ...prev, categoryKey: categories.categoryKeys[0] }));
    }
  }, [selectedTopCategory, selectedSubCategory, filteredCategoryKeys, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="import-form" onSubmit={handleSubmit}>
      <h3>Run Import</h3>

      {catalogError && (
        <div className="error-message">
          {catalogError}. Please refresh the page.
        </div>
      )}

      {config && (
        <div className="provider-info">
          <div>
            <strong>Translation:</strong> {config.translationProvider}
            {config.translationProvider === "google_api_key" && config.hasGoogleApiKey
              ? " (enabled)"
              : " (fallback)"}
          </div>
          <div>
            <strong>Images:</strong> {config.imageProvider}
            {config.imageProvider === "custom_search" &&
            config.hasGoogleApiKey &&
            config.hasCustomSearchEngineId
              ? " (enabled)"
              : " (fallback)"}
          </div>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="store">Store</label>
        <select
          id="store"
          value={formData.store}
          onChange={(e) => handleStoreChange(e.target.value as Store)}
          required
          disabled={catalogLoading}
        >
          {catalog.map((store) => (
            <option
              key={store.key}
              value={store.key}
              disabled={store.implemented === false}
            >
              {store.label}
              {store.implemented === false ? " (coming soon)" : ""}
            </option>
          ))}
        </select>
        {catalog.find((s) => s.key === formData.store)?.implemented === false && (
          <span className="form-hint error-message">
            This store's scraper is not implemented yet. Import is disabled to avoid fake data.
          </span>
        )}
      </div>

      {categories && availableTopCategories.length > 0 && (
        <div className="form-group">
          <label htmlFor="topCategory">Top Category (Optional)</label>
          <select
            id="topCategory"
            value={selectedTopCategory}
            onChange={(e) => {
              setSelectedTopCategory(e.target.value);
              setSelectedSubCategory(""); // Reset sub category
            }}
            disabled={catalogLoading || categoriesLoading}
          >
            <option value="">All Categories</option>
            {availableTopCategories.map((topCat) => (
              <option key={topCat.key} value={topCat.key}>
                {topCat.key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      )}

      {categories && selectedTopCategory && availableSubCategories.length > 0 && (
        <div className="form-group">
          <label htmlFor="subCategory">Sub Category (Optional)</label>
          <select
            id="subCategory"
            value={selectedSubCategory}
            onChange={(e) => {
              setSelectedSubCategory(e.target.value);
            }}
            disabled={catalogLoading || categoriesLoading || !selectedTopCategory}
          >
            <option value="">All</option>
            {availableSubCategories.map((subCat) => (
              <option key={subCat.key} value={subCat.key}>
                {subCat.key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="categoryKey">Category Key</label>
        <select
          id="categoryKey"
          value={formData.categoryKey}
          onChange={(e) =>
            setFormData({ ...formData, categoryKey: e.target.value })
          }
          required
          disabled={catalogLoading || categoriesLoading || filteredCategoryKeys.length === 0}
        >
          {filteredCategoryKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        {filteredCategoryKeys.length === 0 && !catalogLoading && !categoriesLoading && (
          <span className="form-hint">No categories available. Try selecting a different store.</span>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="limit">Limit</label>
        <input
          id="limit"
          type="number"
          min="1"
          max="1000"
          value={formData.limit}
          onChange={(e) =>
            setFormData({ ...formData, limit: parseInt(e.target.value, 10) })
          }
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="translateTo">Translate To (Language Code)</label>
        <input
          id="translateTo"
          type="text"
          value={formData.translateTo}
          onChange={(e) =>
            setFormData({ ...formData, translateTo: e.target.value })
          }
          placeholder="e.g., mn, en"
          maxLength={2}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="imageMode">Image Mode</label>
        <select
          id="imageMode"
          value={formData.imageMode}
          onChange={(e) =>
            setFormData({ ...formData, imageMode: e.target.value as ImageMode })
          }
          required
        >
          <option value="none">None</option>
          <option value="search">Search</option>
          <option value="generate">Generate</option>
        </select>
      </div>

      {formData.store === "gmarket" && (
        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.includeDetails || false}
              onChange={(e) =>
                setFormData({ ...formData, includeDetails: e.target.checked })
              }
            />
            <span>Fetch details (slower)</span>
          </label>
          <span className="form-hint">
            Fetches product detail pages for better descriptions/images. Slower.
          </span>
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
          disabled={loading || catalogLoading || categoriesLoading || catalogError !== null}
      >
        {loading ? "Importing..." : "Run Import"}
      </button>
    </form>
  );
}

export default ImportForm;

