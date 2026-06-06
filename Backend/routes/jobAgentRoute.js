import express from "express";
import {
  applyToAllJobs,
  applyToJob,
  closeAutomationSession,
  discoverJobs,
  getApplyProfile,
  getAutomationTask,
  getDailyReport,
  getDashboard,
  sendDailyReport,
  startAutomationSession,
  updateApplyProfile,
  updateApplicationStatus,
  updatePreferences,
} from "../controllers/jobAgentController.js";
import { authenticate } from "../middlewares/auth.js";

export const jobAgentRoute = express.Router();

jobAgentRoute.use(authenticate);

jobAgentRoute.get("/dashboard", getDashboard);
jobAgentRoute.get("/apply-profile", getApplyProfile);
jobAgentRoute.put("/apply-profile", updateApplyProfile);
jobAgentRoute.put("/preferences", updatePreferences);
jobAgentRoute.post("/discover", discoverJobs);
jobAgentRoute.post("/applications/apply-all", applyToAllJobs);
jobAgentRoute.post("/applications/:applicationId/apply", applyToJob);
jobAgentRoute.get("/automation/tasks/:taskId", getAutomationTask);
jobAgentRoute.post("/applications/:applicationId/automation/start", startAutomationSession);
jobAgentRoute.post("/applications/:applicationId/automation/close", closeAutomationSession);
jobAgentRoute.patch("/applications/:applicationId/status", updateApplicationStatus);
jobAgentRoute.get("/reports/daily", getDailyReport);
jobAgentRoute.post("/reports/daily/send", sendDailyReport);
