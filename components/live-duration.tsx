"use client";

import { useEffect, useState } from "react";

function buildLocalDateTime(startDate: string, startTime: string) {
  return new Date(`${startDate}T${startTime}:00`);
}

function formatDuration(startDate: string, startTime: string) {
  const start = buildLocalDateTime(startDate, startTime);
  const now = new Date();
  const totalMinutes = Math.max(Math.round((now.getTime() - start.getTime()) / 60000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

export function LiveDuration({
  startDate,
  startTime
}: {
  startDate: string;
  startTime: string;
}) {
  const [value, setValue] = useState(() => formatDuration(startDate, startTime));

  useEffect(() => {
    setValue(formatDuration(startDate, startTime));

    const interval = window.setInterval(() => {
      setValue(formatDuration(startDate, startTime));
    }, 30000);

    return () => window.clearInterval(interval);
  }, [startDate, startTime]);

  return <>{value}</>;
}
