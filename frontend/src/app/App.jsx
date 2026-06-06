import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useEffect } from "react";
import Chat from "../features/chat/pages/Chat";
import Login from "../features/auth/pages/Login";
import JobAgent from "../features/jobs/pages/JobAgent";
import { useAuth } from "../features/auth/hook/useAuth";
import InstallBanner from "../../components/InstallBanner";
import NotFound from "../../components/NotFound";
function AuthInitializer() {
  const { GetMe } = useAuth();
  const { user } = useSelector((state) => state.auth);

  useEffect(() => {
    if (!user) {
      GetMe();
    }
  }, []);

  return null;
}

const Spinner = () => (
  <div className="h-screen bg-[#212121] text-white flex items-center justify-center">
    <div className="flex items-center gap-2 text-zinc-500 text-sm">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      Loading...
    </div>
  </div>
);

function PrivateRoute({ children }) {
  const { user, initializing } = useSelector((state) => state.auth);
  if (initializing) return <Spinner />;
  return user ? children : <Navigate to="/login" />;
}

function PublicRoute({ children }) {
  const { user, initializing } = useSelector((state) => state.auth);
  if (initializing) return <Spinner />;
  return !user ? children : <Navigate to="/chat" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthInitializer />
      <InstallBanner />

      <Routes>
        <Route path="*" element={<NotFound />} />
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
        <Route path="/jobs" element={<PrivateRoute><JobAgent /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
