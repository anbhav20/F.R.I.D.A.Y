import axios from "axios"
import { store } from "../app/app.store";
import { setError, setMessage } from "./auth/auth.slice";
export const api= axios.create({
    baseURL:"http://localhost:3000/api/auth",
    withCredentials:true
})

api.interceptors.response.use(

  (response) => {

    const message =
      response.data?.message;

    if (
      message &&
      response.config.method !== "get"
    ) {

      store.dispatch(
        setMessage(message)
      );

      store.dispatch(
        setError(null)
      );
    }

    return response;
  },

  (error) => {

    const message =
      error.response?.data?.message ||
      "Something went wrong";

    store.dispatch(
      setError(message)
    );

    store.dispatch(
      setMessage(null)
    );

    return Promise.reject(error);
  }
);