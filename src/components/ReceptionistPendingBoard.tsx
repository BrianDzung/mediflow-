"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatSlotRange, statusLabel } from "@/lib/format";

export type PendingAppointmentRow = {
  id: string;
  status: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  doctorSpecialty: string;
  startsAt: string;
  endsAt: string;
};

type Props = {
  clinicName: string;
  appointments: PendingAppointmentRow[];
};

export function ReceptionistPendingBoard({ clinicName, appointments }: Props) {
  const router = useRouter();
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [banner, setBanner] = useState("");
  const rows = appointments.filter((row) => !removedIds.includes(row.id));

  function onDecided(appointmentId: string, message: string) {
    setBanner(message);
    setRemovedIds((current) =>
      current.includes(appointmentId) ? current : [...current, appointmentId],
    );
    router.refresh();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Lịch chờ xác nhận</h1>
      <p className="mt-2 text-slate-600">
        Phòng khám pilot: <strong>{clinicName}</strong>. Danh sách mặc định chỉ hiện
        lịch <code>pending</code>. Xác nhận hoặc từ chối từng dòng — lịch đã xử lý
        không còn hiện ở đây.
      </p>

      {banner ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
          role="status"
        >
          {banner}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-slate-600">
          Chưa có lịch chờ xác nhận. Đặt lịch bằng tài khoản bệnh nhân (M1) rồi tải
          lại trang này.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-medium">Thời gian</th>
                <th className="px-4 py-3 font-medium">Bác sĩ</th>
                <th className="px-4 py-3 font-medium">Bệnh nhân</th>
                <th className="px-4 py-3 font-medium">SĐT</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((appointment) => (
                <tr key={appointment.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatSlotRange(appointment.startsAt, appointment.endsAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{appointment.doctorName}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {appointment.doctorSpecialty}
                    </span>
                  </td>
                  <td className="px-4 py-3">{appointment.patientName}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{appointment.patientPhone}</td>
                  <td className="px-4 py-3 font-semibold text-teal-800">
                    {statusLabel(appointment.status)}
                  </td>
                  <td className="px-4 py-3">
                    <PendingRowActions
                      appointmentId={appointment.id}
                      disabled={appointment.status !== "pending"}
                      onDecided={(message) => onDecided(appointment.id, message)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PendingRowActions({
  appointmentId,
  disabled,
  onDecided,
}: {
  appointmentId: string;
  disabled: boolean;
  onDecided: (message: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(decision: "confirm" | "reject") {
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/receptionist/appointments/${appointmentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision === "reject" ? { decision, reason } : { decision }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Không thể cập nhật lịch.");
        return;
      }
      onDecided(decision === "confirm" ? "Đã xác nhận lịch." : "Đã từ chối lịch.");
    } catch {
      setError("Không thể kết nối máy chủ.");
    } finally {
      setPending(false);
    }
  }

  if (disabled) {
    return <p className="text-xs text-slate-500">Không thể xử lý lại.</p>;
  }

  if (mode === "reject") {
    return (
      <div className="min-w-56 space-y-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-700">Lý do từ chối</span>
          <textarea
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none ring-teal-600 focus:ring-2"
            name="reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Nhập lý do (tối thiểu 3 ký tự)"
          />
        </label>
        {error ? (
          <p className="text-xs text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => void submit("reject")}
            className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-800 disabled:opacity-60"
          >
            {pending ? "Đang gửi…" : "Gửi từ chối"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setMode("idle");
              setError("");
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Hủy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void submit("confirm")}
          className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {pending ? "Đang gửi…" : "Xác nhận"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError("");
            setMode("reject");
          }}
          className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-60"
        >
          Từ chối
        </button>
      </div>
    </div>
  );
}
