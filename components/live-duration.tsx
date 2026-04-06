"use client";

import { useEffect, useState } from "react";

function formatDuration(startAt: string) {
  const start = new Date(startAt);
  const now = new Date();
  const totalMinutes = Math.max(Math.round((now.getTime() - start.getTime()) / 60000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

export function LiveDuration({ startAt }: { startAt: string }) {
  const [value, setValue] = useState(() => formatDuration(startAt));

  useEffect(() => {
    setValue(formatDuration(startAt));

    const interval = window.setInterval(() => {
      setValue(formatDuration(startAt));
    }, 30000);

    return () => window.clearInterval(interval);
  }, [startAt]);

  return <>{value}</>;
}
