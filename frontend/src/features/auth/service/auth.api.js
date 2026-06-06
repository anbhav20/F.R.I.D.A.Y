import { api } from "../../api";

export const oauthLogin = async (idToken) => {
  const res = await api.post("/auth/oauth", { idToken });
  return res.data;
};

export const getMe = async () => {
  const res = await api.get("/auth/me");
  return res.data;
};

export const logout = async () => {
  await api.post("/auth/logout");
};