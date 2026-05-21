import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { googleSheetsService } from "../services/googleSheets";
import "./GoogleSheetsConfig.css";

const GoogleSheetsConfig = () => {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncingUrl, setSyncingUrl] = useState(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const data = await googleSheetsService.getConfigs();
      setConfigs(Array.isArray(data) ? data : data.results || []);
    } catch (error) {
      toast.error("Ma'lumotlarni yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const groupedConfigs = React.useMemo(() => {
    const grouped = {};
    configs.forEach((config) => {
      const url = config.sheet_url;
      if (!grouped[url]) {
        grouped[url] = {
          sheet_url: url,
          name: config.name,
          configs: [],
        };
      }
      grouped[url].configs.push(config);
    });
    return Object.values(grouped);
  }, [configs]);

  const handleEdit = (id) => {
    navigate(`/settings/google-sheets/${id}/edit`);
  };

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedGroupToDelete, setSelectedGroupToDelete] = useState(null);
  const [modalClosing, setModalClosing] = useState(false);

  const openDeleteModal = (group) => {
    setSelectedGroupToDelete(group);
    setDeleteModalOpen(true);
    setModalClosing(false);
  };

  const closeDeleteModal = () => {
    setModalClosing(true);
    setTimeout(() => {
      setDeleteModalOpen(false);
      setSelectedGroupToDelete(null);
      setModalClosing(false);
    }, 250);
  };

  const confirmDeleteGroup = async () => {
    if (!selectedGroupToDelete) return;
    setLoading(true);
    const group = selectedGroupToDelete;
    closeDeleteModal();
    try {
      await Promise.all(group.configs.map((c) => googleSheetsService.deleteConfig(c.id)));
      toast.success("Barcha sozlamalar muvaffaqiyatli o'chirildi");
      fetchConfigs();
    } catch (error) {
      toast.error("O'chirishda xatolik yuz berdi");
      fetchConfigs();
    } finally {
      setLoading(false);
    }
  };

  const handleSyncGroup = async (group) => {
    setSyncingUrl(group.sheet_url);
    try {
      const activeConfigs = group.configs.filter((c) => c.is_active);
      if (activeConfigs.length === 0) {
        toast.error("Sinxronizatsiya qilish uchun faol varaqlar mavjud emas");
        return;
      }
      toast.info("Jadvallarni sinxronlash boshlandi...");
      const promises = activeConfigs.map((c) =>
        googleSheetsService.syncNow(c.id).catch((err) => ({
          success: false,
          message: err.response?.data?.message || err.message || "Xatolik",
        }))
      );
      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.success);
      if (successes.length === results.length) {
        toast.success("Barcha varaqlar muvaffaqiyatli sinxronlandi");
      } else {
        toast.warning(
          `${successes.length}/${results.length} varaq sinxronlandi. Ba'zi xatolar yuz berdi.`
        );
      }
      fetchConfigs();
    } catch (error) {
      toast.error("Sinxronizatsiyada kutilmagan xatolik yuz berdi");
    } finally {
      setSyncingUrl(null);
    }
  };

  const getGroupStatus = (group) => {
    const total = group.configs.length;
    const activeCount = group.configs.filter((c) => c.is_active).length;
    if (activeCount === total) {
      return { text: `Faol (${activeCount}/${total})`, className: "active" };
    } else if (activeCount > 0) {
      return { text: `Qisman faol (${activeCount}/${total})`, className: "partial" };
    } else {
      return { text: `Nofaol (${activeCount}/${total})`, className: "inactive" };
    }
  };


  return (
    <div className="google-sheets-page">
      <div className="page-header animate-fadeInDown">
        <div className="header-left">
          <h1 className="page-title">Google Sheets Integratsiyasi</h1>
          <p className="page-subtitle">
            Google jadvallarini avtomatik tarzda Lead sifatida tortish sozlamalari
          </p>
        </div>
        <div className="header-actions">
          <button
            onClick={() => navigate("/settings/google-sheets/create")}
            className="btn-primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Yangi Jadval Qo'shish
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Yuklanmoqda...</p>
        </div>
      ) : (
        <div className="content-card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Loyiha / Jadval</th>
                  <th>Varaq nomi</th>
                  <th>Holati</th>
                  <th>Oxirgi qator</th>
                  <th style={{ textAlign: "right" }}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {groupedConfigs.map((group) => {
                  const firstConfig = group.configs[0];
                  const status = getGroupStatus(group);
                  const isSyncing = syncingUrl === group.sheet_url;
                  const hasActive = group.configs.some((c) => c.is_active);

                  return (
                    <tr
                      key={group.sheet_url}
                      onClick={() => handleEdit(firstConfig.id)}
                      style={{ cursor: "pointer" }}
                      className="clickable-row"
                    >
                      <td>
                        <div style={{ fontWeight: 600 }}>{group.name}</div>
                        <div style={{ fontSize: "12px", marginTop: "4px" }}>
                          <a
                            href={group.sheet_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sheet-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {group.sheet_url}
                          </a>
                        </div>
                      </td>
                      <td>
                        <div className="tab-tags-list">
                          {group.configs.map((c) => (
                            <span
                              key={c.id}
                              className={`tab-tag ${c.is_active ? "active" : "inactive"}`}
                            >
                              {c.tab_name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${status.className}`}>
                          {status.text}
                        </span>
                      </td>
                      <td>
                        <div className="synced-rows-list">
                          {group.configs.map((c) => (
                            <div key={c.id} className="synced-row-item">
                              <span className="synced-row-tab">{c.tab_name}:</span>
                              <span className="synced-row-count">{c.last_synced_row || 0}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        <div className="table-actions">
                          <button
                            onClick={() => handleSyncGroup(group)}
                            disabled={isSyncing || !hasActive}
                            className="btn-icon btn-sync"
                            title="Hozir sinxronlash"
                          >
                            {isSyncing ? (
                              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                              </svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.5 2v6h-6"/>
                                <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => handleEdit(firstConfig.id)}
                            className="btn-icon btn-edit"
                            title="Tahrirlash"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button
                            onClick={() => openDeleteModal(group)}
                            className="btn-icon btn-delete"
                            title="O'chirish"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              <line x1="10" y1="11" x2="10" y2="17"></line>
                              <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {configs.length === 0 && (
                  <tr>
                    <td colSpan="5" className="table-empty">
                      Hech qanday jadval topilmadi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteModalOpen && selectedGroupToDelete &&
        createPortal(
          <div
            className={`modal-overlay ${modalClosing ? "closing" : ""}`}
            onClick={closeDeleteModal}
          >
            <div
              className={`modal-content ${modalClosing ? "closing" : ""}`}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "450px" }}
            >
              <div className="modal-header">
                <h3>Jadval sozlamalarini o'chirish</h3>
                <button className="modal-close" onClick={closeDeleteModal}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div
                className="modal-body"
                style={{ textAlign: "center", padding: "32px 24px" }}
              >
                <div
                  className="modal-icon danger"
                  style={{
                    margin: "0 auto 20px",
                    width: "64px",
                    height: "64px",
                    borderRadius: "50%",
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "#ef4444",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </div>
                <p
                  style={{
                    fontSize: "16px",
                    color: "var(--text-primary)",
                    marginBottom: "8px",
                  }}
                >
                  Rostdan ham ushbu jadvalga tegishli barcha (<strong>{selectedGroupToDelete.configs.length}</strong>) varaq sozlamalarini o'chirmoqchimisiz?
                </p>
                <p
                  style={{ fontSize: "14px", color: "var(--text-secondary)" }}
                >
                  Bu amalni ortga qaytarib bo'lmaydi.
                </p>
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={closeDeleteModal}>
                  Bekor qilish
                </button>
                <button
                  className="btn-danger"
                  onClick={confirmDeleteGroup}
                  disabled={loading}
                >
                  O'chirish
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      }
    </div>
  );
};

export default GoogleSheetsConfig;
