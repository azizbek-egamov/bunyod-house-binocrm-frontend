import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { googleSheetsService } from "../services/googleSheets";
import { getUsers } from "../services/users";
import "./GoogleSheetsConfig.css";

const GoogleSheetsConfigEdit = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Common sheet info
  const [name, setName] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");

  // Inspect and Tab configs
  const [availableTabs, setAvailableTabs] = useState([]);
  const [checkedTabs, setCheckedTabs] = useState([]); // ['Sheet1', 'Sheet2']
  const [initialConfigs, setInitialConfigs] = useState([]); // Array of initial config objects for this sheet_url
  const [tabMappings, setTabMappings] = useState({}); // { tabName: { id, phone_col, name_col, note_col, source_col, operator, is_active, columns, loadingColumns } }
  const [activeConfigTab, setActiveConfigTab] = useState(null);

  const [inspecting, setInspecting] = useState(false);
  const [manualColumnInput, setManualColumnInput] = useState(false);
  const [showNotesDropdown, setShowNotesDropdown] = useState(false);
  const notesDropdownRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notesDropdownRef.current && !notesDropdownRef.current.contains(event.target)) {
        setShowNotesDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const initPage = async () => {
      await fetchOperators();
      await loadConfigs();
    };
    initPage();
  }, [id]);

  const fetchOperators = async () => {
    try {
      const res = await getUsers();
      const data = Array.isArray(res.data) ? res.data : res.data.results || [];
      setOperators(data.filter((u) => u.permissions?.is_operator));
    } catch (error) {
      console.error("Failed to load operators:", error);
      toast.error("Operatorlarni yuklashda xatolik yuz berdi");
    }
  };

  const loadConfigs = async () => {
    setLoading(true);
    try {
      // 1. Get the current configuration
      const currentConfig = await googleSheetsService.getConfig(id);
      const url = currentConfig.sheet_url;
      setSheetUrl(url);

      // Extract general name (strip tab name from parenthesised format like "Leads (Sheet1)")
      const match = currentConfig.name.match(/^(.*?)\s*\([^)]+\)$/);
      const generalName = match ? match[1] : currentConfig.name;
      setName(generalName);

      // 2. Fetch all configurations to find others sharing the same sheet_url
      const allConfigs = await googleSheetsService.getConfigs();
      const list = Array.isArray(allConfigs) ? allConfigs : allConfigs.results || [];
      const relatedConfigs = list.filter((c) => c.sheet_url === url);
      setInitialConfigs(relatedConfigs);

      // 3. Inspect to get available tabs and default columns
      setInspecting(true);
      const inspectRes = await googleSheetsService.inspectConfig(url);
      if (inspectRes.success) {
        setAvailableTabs(inspectRes.tabs || []);
        
        // 4. Build tabMappings and checkedTabs
        const initialChecked = [];
        const mappings = {};

        // Configure mappings for each available tab
        inspectRes.tabs.forEach((tab) => {
          const config = relatedConfigs.find((c) => c.tab_name === tab);
          if (config) {
            initialChecked.push(tab);
            mappings[tab] = {
              id: config.id,
              phone_col: config.phone_col || "",
              name_col: config.name_col || "",
              note_col: config.note_col || "",
              source_col: config.source_col || "",
              operator: config.operator || "",
              is_active: config.is_active ?? true,
              columns: [],
              loadingColumns: false,
            };
          }
        });

        // Add any manually configured tab that might not be in inspectRes.tabs
        relatedConfigs.forEach((config) => {
          if (!mappings[config.tab_name]) {
            initialChecked.push(config.tab_name);
            if (!inspectRes.tabs.includes(config.tab_name)) {
              setAvailableTabs((prev) => [...prev, config.tab_name]);
            }
            mappings[config.tab_name] = {
              id: config.id,
              phone_col: config.phone_col || "",
              name_col: config.name_col || "",
              note_col: config.note_col || "",
              source_col: config.source_col || "",
              operator: config.operator || "",
              is_active: config.is_active ?? true,
              columns: [],
              loadingColumns: false,
            };
          }
        });

        setCheckedTabs(initialChecked);
        setTabMappings(mappings);

        // Set the active configuration tab
        if (initialChecked.includes(currentConfig.tab_name)) {
          setActiveConfigTab(currentConfig.tab_name);
        } else if (initialChecked.length > 0) {
          setActiveConfigTab(initialChecked[0]);
        }

        // Fetch columns for active config tab
        const activeTab = currentConfig.tab_name || initialChecked[0];
        if (activeTab) {
          if (activeTab === inspectRes.selected_tab || activeTab === inspectRes.tabs?.[0]) {
            mappings[activeTab].columns = inspectRes.columns || [];
            setTabMappings({ ...mappings });
          } else {
            fetchColumnsForTab(activeTab, mappings, url);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load config details:", error);
      toast.error("Konfiguratsiyani yuklashda xatolik yuz berdi");
      navigate("/settings/google-sheets");
    } finally {
      setInspecting(false);
      setLoading(false);
    }
  };

  const fetchColumnsForTab = async (tabName, currentMappings = null, customUrl = null) => {
    const mappingsSource = currentMappings || tabMappings;
    setTabMappings((prev) => {
      const source = currentMappings || prev;
      if (!source[tabName]) return source;
      return {
        ...source,
        [tabName]: { ...source[tabName], loadingColumns: true },
      };
    });
    try {
      const urlToUse = customUrl || sheetUrl;
      const res = await googleSheetsService.inspectConfig(urlToUse, tabName);
      if (res.success) {
        setTabMappings((prev) => {
          const source = currentMappings || prev;
          if (!source[tabName]) return source;
          return {
            ...source,
            [tabName]: {
              ...source[tabName],
              columns: res.columns || [],
              loadingColumns: false,
            },
          };
        });
      }
    } catch (error) {
      console.error(`Failed to fetch columns for tab ${tabName}:`, error);
      setTabMappings((prev) => {
        const source = currentMappings || prev;
        if (!source[tabName]) return source;
        return {
          ...source,
          [tabName]: { ...source[tabName], loadingColumns: false },
        };
      });
      toast.error(`${tabName} ustunlarini yuklab bo'lmadi`);
    }
  };

  const handleTabCheck = (tabName, checked) => {
    if (checked) {
      setCheckedTabs((prev) => [...prev, tabName]);
      if (!tabMappings[tabName]) {
        const original = initialConfigs.find((c) => c.tab_name === tabName);
        setTabMappings((prev) => ({
          ...prev,
          [tabName]: {
            id: original?.id || null,
            phone_col: original?.phone_col || "",
            name_col: original?.name_col || "",
            note_col: original?.note_col || "",
            source_col: original?.source_col || "",
            operator: original?.operator || "",
            is_active: original?.is_active ?? true,
            columns: [],
            loadingColumns: false,
          },
        }));
        fetchColumnsForTab(tabName);
      }
      setActiveConfigTab(tabName);
    } else {
      setCheckedTabs((prev) => prev.filter((t) => t !== tabName));
      if (activeConfigTab === tabName) {
        const remaining = checkedTabs.filter((t) => t !== tabName);
        setActiveConfigTab(remaining.length > 0 ? remaining[0] : null);
      }
    }
  };

  const handleTabSwitch = (tabName) => {
    setActiveConfigTab(tabName);
    if (tabMappings[tabName] && tabMappings[tabName].columns.length === 0) {
      fetchColumnsForTab(tabName);
    }
  };

  const handleMappingChange = (field, value) => {
    if (!activeConfigTab) return;
    setTabMappings((prev) => ({
      ...prev,
      [activeConfigTab]: {
        ...prev[activeConfigTab],
        [field]: value,
      },
    }));
  };

  const toggleNoteColumn = (colName) => {
    if (!activeConfigTab) return;
    const activeMapping = tabMappings[activeConfigTab];
    if (!activeMapping) return;
    const currentCols = activeMapping.note_col
      ? activeMapping.note_col
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    let nextCols;
    if (currentCols.includes(colName)) {
      nextCols = currentCols.filter((c) => c !== colName);
    } else {
      nextCols = [...currentCols, colName];
    }
    handleMappingChange("note_col", nextCols.join(", "));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name) {
      toast.error("Iltimos, loyiha nomini kiriting");
      return;
    }
    if (checkedTabs.length === 0) {
      toast.error("Iltimos, kamida bitta varaqni tanlang va sozlang");
      return;
    }

    // Validate mappings
    for (const tab of checkedTabs) {
      const mapping = tabMappings[tab];
      if (!mapping.operator) {
        toast.error(`"${tab}" varag'ida Operatorni tanlash majburiy.`);
        setActiveConfigTab(tab);
        return;
      }
      if (!mapping.phone_col || !mapping.name_col) {
        toast.error(`"${tab}" varag'ida Telefon va Ism ustunlarini tanlash majburiy.`);
        setActiveConfigTab(tab);
        return;
      }
    }

    setSaving(true);
    try {
      // 1. Identify which configs to delete (unchecked from initial configs)
      const toDelete = initialConfigs.filter((c) => !checkedTabs.includes(c.tab_name));

      const promises = [];

      // Delete promises
      toDelete.forEach((config) => {
        promises.push(googleSheetsService.deleteConfig(config.id));
      });

      // Create/Update promises
      checkedTabs.forEach((tabName) => {
        const mapping = tabMappings[tabName];
        const data = {
          name: `${name} (${tabName})`,
          sheet_url: sheetUrl,
          tab_name: tabName,
          is_active: mapping.is_active,
          phone_col: mapping.phone_col,
          name_col: mapping.name_col,
          note_col: mapping.note_col,
          source_col: mapping.source_col,
          operator: mapping.operator ? parseInt(mapping.operator) : null,
        };

        if (mapping.id) {
          promises.push(googleSheetsService.updateConfig(mapping.id, data));
        } else {
          promises.push(googleSheetsService.createConfig(data));
        }
      });

      await Promise.all(promises);
      toast.success("Barcha sozlamalar muvaffaqiyatli saqlandi");
      navigate("/settings/google-sheets");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Xatolik yuz berdi. Maydonlarni to'g'ri to'ldiring."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="google-sheets-page">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  const activeMapping = activeConfigTab ? tabMappings[activeConfigTab] : null;
  const availableColumns = activeMapping?.columns || [];

  return (
    <div className="google-sheets-page google-sheets-form-page">
      <div className="page-header animate-fadeInDown">
        <div className="header-left">
          <h1 className="page-title">Google Sheets Sozlamalarini Tahrirlash</h1>
          <p className="page-subtitle">
            Mavjud jadvalni avtomatik tarzda Lead sifatida tortish sozlamalarini o'zgartirish
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            onClick={() => navigate("/settings/google-sheets")}
            className="btn-secondary"
            disabled={saving}
          >
            Bekor qilish
          </button>
        </div>
      </div>

      <div className="content-card animate-fadeInUp" style={{ padding: "24px" }}>
        <form onSubmit={handleSubmit}>
          <div className="google-sheets-modal-form-grid" style={{ marginTop: 0 }}>
            
            <div className="google-sheets-modal-form-full form-group">
              <label>
                Loyiha / Jadval Nomi <span className="required">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Masalan: Leads 2024"
              />
            </div>

            <div className="google-sheets-modal-form-full form-group">
              <label>Google Sheet URL</label>
              <input
                type="url"
                value={sheetUrl}
                disabled
                style={{ backgroundColor: 'var(--bg-tertiary)', cursor: 'not-allowed' }}
              />
            </div>

            {/* Tabs checkboxes */}
            {availableTabs.length > 0 && (
              <div className="tabs-selection-container form-group google-sheets-modal-form-full">
                <label>Sinxronlashtiriladigan varaqlar (Tabs) <span className="required">*</span></label>
                <div className="tabs-checkbox-grid">
                  {availableTabs.map((tab) => {
                    const isChecked = checkedTabs.includes(tab);
                    return (
                      <label key={tab} className={`tab-checkbox-label ${isChecked ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleTabCheck(tab, e.target.checked)}
                        />
                        <span>{tab}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab mappings section */}
            {checkedTabs.length > 0 && activeConfigTab && activeMapping && (
              <div className="tab-configs-container google-sheets-modal-form-full">
                <div className="tab-configs-headers">
                  {checkedTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`tab-config-header-btn ${activeConfigTab === tab ? 'active' : ''}`}
                      onClick={() => handleTabSwitch(tab)}
                    >
                      {tab}
                      <span className={`tab-status-dot ${tabMappings[tab]?.is_active ? 'active' : 'inactive'}`} style={{ marginLeft: '8px' }}></span>
                    </button>
                  ))}
                </div>

                <div className="google-sheets-modal-form-grid" style={{ marginTop: '20px' }}>
                  
                  <div className="form-group">
                    <label>Biriktiriladigan Operator <span style={{ color: "#ef4444" }}>*</span></label>
                    <select
                      value={activeMapping.operator}
                      onChange={(e) => handleMappingChange("operator", e.target.value)}
                    >
                      <option value="">-- Tanlanmagan --</option>
                      {operators.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.first_name} {op.last_name} (@{op.username})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="toggle-row" style={{ gridColumn: "span 1" }}>
                    <div className="toggle-info">
                      <div className="toggle-title">Sinxronizatsiya holati</div>
                      <div className="toggle-sub">Ushbu varaqdan leadlarni tortishni faollashtirish</div>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={activeMapping.is_active}
                        onChange={(e) => handleMappingChange("is_active", e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="mapping-card">
                    <div className="mapping-header">
                      <div className="mapping-title-group">
                        <h4 className="mapping-title">
                          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" style={{ color: "var(--primary-color)" }}>
                            <path d="M4 19h16M4 15h16M4 11h16M4 7h16" />
                          </svg>
                          "{activeConfigTab}" Varaqi uchun Ustun Nomlarini Moslashtirish
                        </h4>
                        <p className="mapping-subtitle">
                          CRM maydonlarini Google Sheets ustunlari bilan mos qatorda bog'lang (1-qatordagi nomlar)
                        </p>
                      </div>
                      {availableColumns.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setManualColumnInput(!manualColumnInput)}
                          className="mapping-toggle-btn"
                        >
                          {manualColumnInput ? (
                            <>
                              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><path d="M4 6h16M4 12h16M4 18h7"/></svg>
                              Dropdown orqali tanlash
                            </>
                          ) : (
                            <>
                              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
                              Qo'lda yozish
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {activeMapping.loadingColumns ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '24px', alignItems: 'center', gap: '10px' }}>
                        <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Ustunlar yuklanmoqda...</p>
                      </div>
                    ) : (
                      <div className="mapping-grid">
                        
                        {/* Phone Column Mapping */}
                        <div className="mapping-row">
                          <div className="mapping-field-info">
                            <div className="mapping-field-icon">
                              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                              </svg>
                            </div>
                            <div className="mapping-field-details">
                              <span className="mapping-field-name">
                                Telefon Raqami <span className="required" style={{ color: "#ef4444" }}>*</span>
                              </span>
                              <span className="mapping-field-type">Lead aloqa raqami</span>
                            </div>
                          </div>
                          <div className="mapping-arrow">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="5" y1="12" x2="19" y2="12"/>
                              <polyline points="12 5 19 12 12 19"/>
                            </svg>
                          </div>
                          <div className="mapping-selector">
                            {availableColumns.length > 0 && !manualColumnInput ? (
                              <select
                                value={activeMapping.phone_col}
                                onChange={(e) => handleMappingChange("phone_col", e.target.value)}
                                required
                              >
                                <option value="">-- Google Sheets ustunini tanlang --</option>
                                {availableColumns.map((col) => (
                                  <option key={col} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={activeMapping.phone_col}
                                onChange={(e) => handleMappingChange("phone_col", e.target.value)}
                                required
                                placeholder="Masalan: Telefon yoki Tel (ustun sarlavhasi)"
                              />
                            )}
                          </div>
                        </div>

                        {/* Name Column Mapping */}
                        <div className="mapping-row">
                          <div className="mapping-field-info">
                            <div className="mapping-field-icon">
                              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                              </svg>
                            </div>
                            <div className="mapping-field-details">
                              <span className="mapping-field-name">
                                Ism Familiyasi <span className="required" style={{ color: "#ef4444" }}>*</span>
                              </span>
                              <span className="mapping-field-type">Mijoz to'liq ismi</span>
                            </div>
                          </div>
                          <div className="mapping-arrow">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="5" y1="12" x2="19" y2="12"/>
                              <polyline points="12 5 19 12 12 19"/>
                            </svg>
                          </div>
                          <div className="mapping-selector">
                            {availableColumns.length > 0 && !manualColumnInput ? (
                              <select
                                value={activeMapping.name_col}
                                onChange={(e) => handleMappingChange("name_col", e.target.value)}
                                required
                              >
                                <option value="">-- Google Sheets ustunini tanlang --</option>
                                {availableColumns.map((col) => (
                                  <option key={col} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={activeMapping.name_col}
                                onChange={(e) => handleMappingChange("name_col", e.target.value)}
                                required
                                placeholder="Masalan: F.I.O yoki Ism"
                              />
                            )}
                          </div>
                        </div>

                        {/* Note Column Mapping */}
                        <div className="mapping-row">
                          <div className="mapping-field-info">
                            <div className="mapping-field-icon">
                              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                                <polyline points="10 9 9 9 8 9"/>
                              </svg>
                            </div>
                            <div className="mapping-field-details">
                              <span className="mapping-field-name">Izoh Ustuni</span>
                              <span className="mapping-field-type">Qo'shimcha tafsilotlar</span>
                            </div>
                          </div>
                          <div className="mapping-arrow">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="5" y1="12" x2="19" y2="12"/>
                              <polyline points="12 5 19 12 12 19"/>
                            </svg>
                          </div>
                          <div className="mapping-selector" ref={notesDropdownRef}>
                            {availableColumns.length > 0 && !manualColumnInput ? (
                              <div className="multi-select-container">
                                <div 
                                  className={`multi-select-trigger ${showNotesDropdown ? 'active' : ''}`}
                                  onClick={() => setShowNotesDropdown(!showNotesDropdown)}
                                >
                                  {activeMapping.note_col ? (
                                    <div className="selected-tags">
                                      {activeMapping.note_col.split(',').map(s => s.trim()).filter(Boolean).map(col => (
                                        <span key={col} className="selected-tag">
                                          {col}
                                          <button
                                            type="button"
                                            className="remove-tag-btn"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleNoteColumn(col);
                                            }}
                                          >
                                            &times;
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="placeholder">-- Ustunlarni tanlang (ko'p tanlovli) --</span>
                                  )}
                                  <div className="dropdown-arrow-icon">
                                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none">
                                      <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                  </div>
                                </div>
                                {showNotesDropdown && (
                                  <div className="multi-select-dropdown">
                                    {availableColumns.map((col) => {
                                      const isSelected = (activeMapping.note_col ? activeMapping.note_col.split(',').map(s => s.trim()).filter(Boolean) : []).includes(col);
                                      return (
                                        <div
                                          key={col}
                                          className={`multi-select-option ${isSelected ? 'selected' : ''}`}
                                          onClick={() => toggleNoteColumn(col)}
                                        >
                                          <span className="checkbox-icon">
                                            {isSelected && "✓"}
                                          </span>
                                          <span className="option-label">{col}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ width: '100%' }}>
                                <input
                                  type="text"
                                  value={activeMapping.note_col}
                                  onChange={(e) => handleMappingChange("note_col", e.target.value)}
                                  placeholder="Masalan: Izoh, Kategoriya yoki Qisqacha ma'lumot"
                                />
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                                  Bir nechta ustunlarni vergul bilan ajratib yozing (masalan: Izoh, Qavat)
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Source Column Mapping */}
                        <div className="mapping-row">
                          <div className="mapping-field-info">
                            <div className="mapping-field-icon">
                              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="2" y1="12" x2="22" y2="12"/>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                              </svg>
                            </div>
                            <div className="mapping-field-details">
                              <span className="mapping-field-name">Manba Ustuni</span>
                              <span className="mapping-field-type">Reklama yoki tashqi kanal</span>
                            </div>
                          </div>
                          <div className="mapping-arrow">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="5" y1="12" x2="19" y2="12"/>
                              <polyline points="12 5 19 12 12 19"/>
                            </svg>
                          </div>
                          <div className="mapping-selector">
                            {availableColumns.length > 0 && !manualColumnInput ? (
                              <select
                                value={activeMapping.source_col}
                                onChange={(e) => handleMappingChange("source_col", e.target.value)}
                              >
                                <option value="">-- Tanlang (ixtiyoriy) --</option>
                                {availableColumns.map((col) => (
                                  <option key={col} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={activeMapping.source_col}
                                onChange={(e) => handleMappingChange("source_col", e.target.value)}
                                placeholder="Masalan: Manba, Instagram yoki Platforma"
                              />
                            )}
                          </div>
                        </div>

                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}

          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
            <button
              type="button"
              onClick={() => navigate("/settings/google-sheets")}
              className="btn-secondary"
              disabled={saving}
            >
              Bekor qilish
            </button>
            <button type="submit" className="btn-primary" disabled={saving || checkedTabs.length === 0}>
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GoogleSheetsConfigEdit;
