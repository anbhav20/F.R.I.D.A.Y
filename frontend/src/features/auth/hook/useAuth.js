import { useDispatch } from "react-redux";

import { register, login, getMe, logout } from "../service/auth.api";
import { setUser, setLoading, setError } from "../auth.slice";

export const useAuth = () => {
  const dispatch = useDispatch();

  const registerUser = async (username, email, password) => {
    try {
      dispatch(setLoading(true));

      const res = await register(username, email, password);

      return res;
    } catch (error) {
      dispatch(
        setError(error.response?.data?.message || error.message)
      );

      console.error(
        "Registration error:",
        error.response?.data || error.message
      );
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
      dispatch(
        setError(error.response?.data?.message || error.message)
      );

      console.error(
        "Login error:",
        error.response?.data || error.message
      );
    } finally {
      dispatch(setLoading(false));
    }
  };

  const GetMe = async () => {
    try {
      dispatch(setLoading(true));
      const res = await getMe();
      if (res.success) {
        dispatch(setUser(res.user));
      }
      return res;
    } catch (error) {
      dispatch(
        setError(error.response?.data?.message || error.message)
      );
      console.error(
        "Fetch current user(getme) error:",
        error.response?.data || error.message
      );
    } finally {
      dispatch(setLoading(false));
    }
  };

  const logOut = async ()=>{
    try {
        dispatch(setLoading(true))
        await logout()
        dispatch(setUser(null))
    } catch (error) {
         dispatch(
        setError(error.response?.data?.message || error.message)
      );
      console.error(
        "logout error:",
        error.response?.data || error.message
      );
    } finally {
      dispatch(setLoading(false));
    }
    }


  return {
    registerUser,
    loginUser,
    GetMe,
    logOut
  };
};