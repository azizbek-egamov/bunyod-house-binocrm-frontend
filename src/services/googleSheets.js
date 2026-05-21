import api from "./api";

export const googleSheetsService = {
  // Barcha konfiguratsiyalarni olish
  getConfigs: async () => {
    const response = await api.get("/google-sheets-configs/");
    return response.data;
  },

  // Bitta konfiguratsiyani olish
  getConfig: async (id) => {
    const response = await api.get(`/google-sheets-configs/${id}/`);
    return response.data;
  },

  // Google Sheet-dan varaqlar va ustunlarni yuklash
  inspectConfig: async (sheetUrl, tabName = null) => {
    const response = await api.post("/google-sheets-configs/inspect/", {
      sheet_url: sheetUrl,
      tab_name: tabName,
    });
    return response.data;
  },

  // Yangi konfiguratsiya yaratish
  createConfig: async (data) => {
    const response = await api.post("/google-sheets-configs/", data);
    return response.data;
  },

  // Konfiguratsiyani yangilash
  updateConfig: async (id, data) => {
    const response = await api.patch(`/google-sheets-configs/${id}/`, data);
    return response.data;
  },

  // Konfiguratsiyani o'chirish
  deleteConfig: async (id) => {
    const response = await api.delete(`/google-sheets-configs/${id}/`);
    return response.data;
  },

  // Zudlik bilan sinxronizatsiya qilish
  syncNow: async (id) => {
    const response = await api.post(`/google-sheets-configs/${id}/sync_now/`);
    return response.data;
  },
};
