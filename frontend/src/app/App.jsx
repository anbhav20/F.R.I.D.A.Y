import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useEffect } from "react";

import Chat from "../features/chat/pagess/Chat";
import Login from "../features/auth/pages/Login";
import SignUp from "../features/auth/pages/SignUp";
import VerifyEmail from "../features/auth/pages/VerifyEmail";
import { useAuth } from "../features/auth/hook/useAuth";

function PrivateRoute({ children }) {
  const { GetMe } = useAuth();

  const { user, loading } = useSelector((state) => state.auth);

  useEffect(() => {
    if (!user) {
      GetMe();
    }
  }, []);

  if (loading) {
    return (
      <div className="h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
}

function PublicRoute({ children }) {
  const { user } = useSelector((state) => state.auth);

  return !user ? children : <Navigate to="/chat" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Default Route */}
        <Route path="/" element={<Navigate to="/login" />} />

        {/* Public Routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/signup"
          element={
            <PublicRoute>
              <SignUp />
            </PublicRoute>
          }
        />

        <Route
          path="/verify-email"
          element={
            <PublicRoute>
              <VerifyEmail />
            </PublicRoute>
          }
        />

        {/* Protected Route */}
        <Route
          path="/chat"
          element={
            <PrivateRoute>
              <Chat />
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}