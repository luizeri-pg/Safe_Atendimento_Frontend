import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getAccessToken, getPublicDisplayToken } from "../auth/storage";

type SocketStatus = "disconnected" | "connecting" | "connected" | "error";

export function useSocket(params?: { publicDisplay?: boolean }) {
  const [status, setStatus] = useState<SocketStatus>("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);

  const socket = useMemo(() => {
    const token = getAccessToken();
    const publicToken = params?.publicDisplay ? getPublicDisplayToken() : null;
    return io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
      auth: {
        token: token || undefined,
        publicToken: publicToken || undefined
      }
    });
  }, [params?.publicDisplay]);

  useEffect(() => {
    setStatus("connecting");
    const onConnect = () => {
      setLastError(null);
      setStatus("connected");
    };
    const onDisconnect = () => setStatus("disconnected");
    const onConnectError = (e: any) => {
      setStatus("error");
      setLastError(String(e?.message || e));
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.disconnect();
    };
  }, [socket]);

  return { socket, status, lastError };
}

