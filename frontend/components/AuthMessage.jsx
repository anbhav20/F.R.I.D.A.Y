import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearMessage } from "../src/features/auth/auth.slice";

export default function AuthMessage() {
  const dispatch = useDispatch();

  const { error, message } = useSelector(
    (state) => state.auth
  );

  useEffect(() => {
    if (error || message) {
      const timer = setTimeout(() => {
        dispatch(clearMessage());
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [error, message]);

  if (!error && !message) return null;

  return (
    <div
      className={`
        text-sm rounded-xl px-4 py-3 transition-all duration-300

        ${
          error
            ? `
              text-red-300
              bg-red-500/10
              border border-red-500/20
            `
            : `
              text-emerald-300
              bg-emerald-500/10
              border border-emerald-500/20
            `
        }
      `}
    >
      {error || message}
    </div>
  );
}