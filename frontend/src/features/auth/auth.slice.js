import { createSlice } from "@reduxjs/toolkit";

const authSlice = createSlice({
  name: "auth",

  initialState: {
    user: null,
    loading: false,
    error: null,
    message: null,
  },

  reducers: {
    setUser(state, action) {
      state.user = action.payload;
    },

    // ← new: called when refresh token expires → forces logout
    clearUser(state) {
      state.user = null;
    },

    setLoading(state, action) {
      state.loading = action.payload;
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
  setError,
  setMessage,
  clearMessage,
} = authSlice.actions;

export default authSlice.reducer;