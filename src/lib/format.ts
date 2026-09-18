export function formatSlotRange(startsAt: Date | string, endsAt: Date | string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const startTime = start.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const endTime = end.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return `${date} · ${startTime}–${endTime}`;
}

export function statusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Chờ xác nhận (pending)";
    case "confirmed":
      return "Đã xác nhận (confirmed)";
    case "rejected":
      return "Từ chối (rejected)";
    default:
      return status;
  }
}

export function statusClassName(status: string) {
  switch (status) {
    case "confirmed":
      return "text-emerald-800";
    case "rejected":
      return "text-rose-800";
    default:
      return "text-teal-800";
  }
}
