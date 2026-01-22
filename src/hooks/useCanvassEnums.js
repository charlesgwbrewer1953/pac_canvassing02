// src/hooks/useCanvassEnums.js
import { useEffect, useState } from "react";
import { fetchEnums } from "../api/enums";

export function useCanvassEnums(API_BASE) {
  const [enums, setEnums] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetchEnums(API_BASE)
      .then((data) => {
        if (!cancelled) setEnums(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [API_BASE]);

  return { enums, loading, error };
}