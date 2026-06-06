import { api } from "../../api";

export const fetchJobDashboard = () => api.get("/job-agent/dashboard");
export const fetchApplyProfile = () => api.get("/job-agent/apply-profile");
export const saveApplyProfile = (applyProfile) => api.put("/job-agent/apply-profile", applyProfile);
export const saveJobPreferences = (preferences) => api.put("/job-agent/preferences", preferences);
export const discoverJobs = (preferences) => api.post("/job-agent/discover", { preferences });
export const applyToJob = (applicationId) => api.post(`/job-agent/applications/${applicationId}/apply`);
export const applyToAllJobs = (applicationIds = []) => api.post("/job-agent/applications/apply-all", { applicationIds });
export const fetchAutomationTask = (taskId) => api.get(`/job-agent/automation/tasks/${taskId}`);
export const startAutomationSession = (applicationId, payload = {}) =>
  api.post(`/job-agent/applications/${applicationId}/automation/start`, payload);
export const closeAutomationSession = (applicationId) =>
  api.post(`/job-agent/applications/${applicationId}/automation/close`);
export const updateApplicationStatus = (applicationId, status) =>
  api.patch(`/job-agent/applications/${applicationId}/status`, { status });
export const fetchDailyReport = () => api.get("/job-agent/reports/daily");
export const sendDailyReport = () => api.post("/job-agent/reports/daily/send");
