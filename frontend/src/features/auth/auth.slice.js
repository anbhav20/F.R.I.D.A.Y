import { createSlice } from "@reduxjs/toolkit";

const authSlice = createSlice({
  name: "auth",

  initialState: {
    user: null,
    loading: false,
    initializing: true,  // true until first GetMe resolves
    error: null,
    message: null,
  },

  reducers: {
    setUser(state, action) {
      state.user = action.payload;
    },

    clearUser(state) {
      state.user = null;
    },

    setLoading(state, action) {
      state.loading = action.payload;
    },

    setInitializing(state, action) {
      state.initializing = action.payload;
    },

    setError(state, action) {
      state.error = action.payload;
    },

    setMessage(state, action) {
      state.message = action.payload;
    },

    clearMessage(state) {
      state.message = null;
      state.error = null;
    },
  },
});

export const {
  setUser,
  clearUser,
  setLoading,
  setInitializing,
  setError,
  setMessage,
  clearMessage,
} = authSlice.actions;

export default authSlice.reducer;