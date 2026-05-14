import { useDispatch } from "react-redux";
import { register, login, getMe, logout } from "../service/auth.api";
import { setUser, setLoading, setInitializing, setError } from "../auth.slice";

export const useAuth = () => {
  const dispatch = useDispatch();

  const registerUser = async (username, email, password) => {
    try {
      dispatch(setLoading(true));
      const res = await register(username, email, password);
      return res;
    } catch (error) {
      dispatch(setError(error.response?.data?.message || error.message));
    } finally {
      dispatch(setLoading(false));
    }
  };

  const loginUser = async ({ email, password }) => {
    try {
      dispatch(setLoading(true));
      const res = await login(email, password);
      if (res.success) {
        dispatch(setUser(res.user));
      }
      return res;
    } catch (error) {
      dispatch(setError(error.response?.data?.message || error.message));
    } finally {
      dispatch(setLoading(false));
    }
  };

  const GetMe = async () => {
    try {
      // don't touch `loading` here — that's for button spinners
      // `initializing` is specifically for the first auth check on page load
      const res = await getMe();
      if (res.success) {
        dispatch(setUser(res.user));
      }
      return res;
    } catch (error) {
      // silently fail — user just isn't logged in
      dispatch(setUser(null));
    } finally {
      dispatch(setInitializing(false));  // auth check done, whatever the result
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

  return { registerUser, loginUser, GetMe, logOut };
};