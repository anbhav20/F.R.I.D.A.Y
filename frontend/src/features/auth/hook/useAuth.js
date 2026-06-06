import { useDispatch } from "react-redux";
import { oauthLogin, getMe, logout } from "../service/auth.api";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider, githubProvider } from "../../../config/firebase";
import { setUser, setLoading, setInitializing, setError } from "../auth.slice";

export const useAuth = () => {
  const dispatch = useDispatch();

  const loginWithGoogle = async () => {
    try {
      dispatch(setLoading(true));
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const res = await oauthLogin(idToken);
      if (res.success) dispatch(setUser(res.user));
      return res;
    } catch (error) {
      dispatch(setError(error.response?.data?.message || "Google login failed."));
    } finally {
      dispatch(setLoading(false));
    }
  };

  const loginWithGithub = async () => {
    try {
      dispatch(setLoading(true));
      const result = await signInWithPopup(auth, githubProvider);
      const idToken = await result.user.getIdToken();
      const res = await oauthLogin(idToken);
      if (res.success) dispatch(setUser(res.user));
      return res;
    } catch (error) {
      dispatch(setError(error.response?.data?.message || "GitHub login failed."));
    } finally {
      dispatch(setLoading(false));
    }
  };

  const GetMe = async () => {
    try {
      const res = await getMe();
      if (res.success) dispatch(setUser(res.user));
      return res;
    } catch {
      dispatch(setUser(null));
    } finally {
      dispatch(setInitializing(false));
    }
  };

  const logOut = async () => {
    try {
      dispatch(setLoading(true));
      await logout();
      dispatch(setUser(null));
    } catch (error) {
      dispatch(setError(error.response?.data?.message || error.message));
    } finally {
      dispatch(setLoading(false));
    }
  };

  return { loginWithGoogle, loginWithGithub, GetMe, logOut };
};