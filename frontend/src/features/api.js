import axios from "axios";
import { store } from "../app/app.store";
import { setError, setMessage, clearUser } from "./auth/auth.slice";  // add clearUser to your slice

export const api = axios.create({
  baseURL: "http://localhost:3000/api/auth",
  withCredentials: true,
});

// ── Refresh token logic ───────────────────────────────────────────────────────
let isRefreshing = false;
// Queue of requests that came in while refresh was in progress
let failedQueue  = [];

const processQueue = (error) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()));
  failedQueue = [];
};

// ── Response interceptor ──────────────────────────────────────────────────────
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
    const original = error.config;
    const code     = error.response?.data?.code;
    const status   = error.response?.status;

    // ── Access token expired → try refresh ───────────────────────────────────
    if (status === 401 && code === "TOKEN_EXPIRED" && !original._retry) {
      original._retry = true;  // prevent infinite loop

      if (isRefreshing) {
        // Another request is already refreshing — wait in queue
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(original))   // retry original request after refresh
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        // Call refresh endpoint — backend sets new access token cookie automatically
        await api.post("/refresh");
        processQueue(null);             // unblock waiting requests
        return api(original);           // retry the original failed request
      } catch (refreshError) {
        processQueue(refreshError);

        // Refresh token is also expired or invalid → force logout
        store.dispatch(clearUser());
        store.dispatch(setError("Session expired. Please log in again."));
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ── Refresh token itself expired (called from /refresh endpoint) ──────────
    if (status === 401 && code === "REFRESH_EXPIRED") {
      store.dispatch(clearUser());
      store.dispatch(setError("Session expired. Please log in again."));
      window.location.href = "/login";
      return Promise.reject(error);
    }

    // ── All other errors ──────────────────────────────────────────────────────
    const message = error.response?.data?.message || "Something went wrong";
    store.dispatch(setError(message));
    store.dispatch(setMessage(null));
    return Promise.reject(error);
  }
);