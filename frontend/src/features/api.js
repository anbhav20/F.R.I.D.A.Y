import axios from "axios";
import { store } from "../app/app.store";
import { setError, setMessage, clearUser } from "./auth/auth.slice";

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue  = [];

const processQueue = (error) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()));
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => {
    const message = response.data?.message;
    if (message && response.config.method !== "get") {
      store.dispatch(setMessage(message));
      store.dispatch(setError(null));
    }
    return response;
  },

  async (error) => {
    const original      = error.config;
    const status        = error.response?.status;
    const isRefreshCall = original.url?.includes("/refresh");
    const isMeCall      = original.url?.includes("/me");
    const isLoginCall   = original.url?.includes("/login");

    // ── Refresh call itself failed → force logout ─────────────────────────────
    if (isRefreshCall && status === 401) {
      store.dispatch(clearUser());
      store.dispatch(setError("Session expired. Please log in again."));
      window.location.href = "/login";
      return Promise.reject(error);
    }

    // ── /me failed → not logged in, just reject silently ─────────────────────
    if (isMeCall && status === 401) {
      return Promise.reject(error);
    }

    // ── Login failed → show error directly, no refresh attempt ───────────────
    if (isLoginCall && status === 401) {
      const message = error.response?.data?.message || "Invalid email or password";
      store.dispatch(setError(message));
      store.dispatch(setMessage(null));
      return Promise.reject(error);
    }

    // ── Any other 401 → attempt refresh ──────────────────────────────────────
    if (status === 401 && !original._retry && !isRefreshCall && !isLoginCall) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(original))
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        await api.post("/auth/refresh");
        processQueue(null);
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError);
        store.dispatch(clearUser());
        store.dispatch(setError("Session expired. Please log in again."));
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ── All other errors ──────────────────────────────────────────────────────
    const message = error.response?.data?.message || "Something went wrong";
    store.dispatch(setError(message));
    store.dispatch(setMessage(null));
    return Promise.reject(error);
  }
);