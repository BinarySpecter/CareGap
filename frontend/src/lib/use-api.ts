"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useApiData<T>(url: string | null) {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    error: null,
    loading: Boolean(url),
  });
  const [reloadToken, setReloadToken] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (!url) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting local fetch state for a new request
      setState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    const id = ++requestId.current;
    setState((previous) => ({
      data: previous.data,
      error: null,
      loading: true,
    }));

    fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          let detail = `Request failed with status ${response.status}`;
          try {
            const payload = (await response.json()) as { detail?: unknown };
            if (typeof payload.detail === "string") detail = payload.detail;
          } catch {
            // Keep the status-based message.
          }
          throw new ApiError(response.status, detail);
        }
        return (await response.json()) as T;
      })
      .then((data) => {
        if (requestId.current !== id) return;
        setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId.current !== id) return;
        setState({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "The analysis API could not be loaded.",
          loading: false,
        });
      });

    return () => controller.abort();
  }, [url, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return { ...state, reload };
}

export function useApiAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    setPending(true);
    setError(null);
    try {
      return await action();
    } catch (actionError) {
      if (mounted.current) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "The request could not be completed.",
        );
      }
      return null;
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);

  return { pending, error, setError, run };
}
