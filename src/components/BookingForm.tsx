"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatSlotRange, statusLabel } from "@/lib/format";

type Doctor = {
  id: string;
  name: string;
  specialty: string;
  clinicName: string;
};

type Slot = {
  id: string;
  startsAt: string;
  endsAt: string;
};

type CreatedAppointment = {
  id: string;
  status: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  startsAt: string;
  endsAt: string;
};

type Props = {
  defaultName: string;
  defaultPhone: string;
};

export function BookingForm({ defaultName, defaultPhone }: Props) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [patientName, setPatientName] = useState(defaultName);
  const [patientPhone, setPatientPhone] = useState(defaultPhone);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedAppointment | null>(null);

  async function loadSlots(nextDoctorId: string) {
    if (!nextDoctorId) {
      setSlots([]);
      setSlotId("");
      return;
    }
    setLoadingSlots(true);
    setSlotId("");
    try {
      const response = await fetch(`/api/slots?doctorId=${encodeURIComponent(nextDoctorId)}`);
      const data = (await response.json()) as { slots?: Slot[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Không tải được khung giờ.");
      setSlots(data.slots ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được khung giờ.");
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/doctors")
      .then(async (response) => {
        const data = (await response.json()) as { doctors?: Doctor[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Không tải được danh sách bác sĩ.");
        if (cancelled) return;
        const nextDoctors = data.doctors ?? [];
        setDoctors(nextDoctors);
        const firstId = nextDoctors[0]?.id ?? "";
        setDoctorId(firstId);
        await loadSlots(firstId);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setCreated(null);
    setPending(true);
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, patientName, patientPhone }),
      });
      const data = (await response.json()) as {
        error?: string;
        appointment?: CreatedAppointment;
      };
      if (!response.ok) {
        setError(data.error ?? "Không thể gửi yêu cầu đặt lịch.");
        if (response.status === 409 && doctorId) {
          const slotsRes = await fetch(`/api/slots?doctorId=${encodeURIComponent(doctorId)}`);
          const slotsData = (await slotsRes.json()) as { slots?: Slot[] };
          setSlots(slotsData.slots ?? []);
          setSlotId("");
        }
        return;
      }
      if (data.appointment) {
        setCreated(data.appointment);
        setSlots((current) => current.filter((slot) => slot.id !== slotId));
        setSlotId("");
      }
    } catch {
      setError("Không thể kết nối máy chủ.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {created ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950" role="status">
          <p className="font-medium">Đã gửi yêu cầu đặt lịch.</p>
          <p className="mt-1">
            {created.doctorName} · {formatSlotRange(created.startsAt, created.endsAt)}
          </p>
          <p className="mt-1">
            Liên hệ: {created.patientName} — {created.patientPhone}
          </p>
          <p className="mt-1 font-semibold">Trạng thái: {statusLabel(created.status)}</p>
        </div>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Bác sĩ</span>
        <select
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none ring-teal-600 focus:ring-2"
          name="doctorId"
          value={doctorId}
          onChange={(e) => {
            const nextDoctorId = e.target.value;
            setDoctorId(nextDoctorId);
            void loadSlots(nextDoctorId);
          }}
          required
        >
          {doctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.name} — {doctor.specialty}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Khung giờ còn trống</legend>
        {loadingSlots ? <p className="text-sm text-slate-500">Đang tải khung giờ…</p> : null}
        {!loadingSlots && slots.length === 0 ? (
          <p className="text-sm text-slate-600">Không còn khung giờ trống cho bác sĩ này.</p>
        ) : (
          <div className="space-y-2">
            {slots.map((slot) => (
              <label
                key={slot.id}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                  slotId === slot.id ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="slotId"
                  value={slot.id}
                  checked={slotId === slot.id}
                  onChange={() => setSlotId(slot.id)}
                />
                <span>{formatSlotRange(slot.startsAt, slot.endsAt)}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Họ tên</span>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-teal-600 focus:ring-2"
          name="patientName"
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Số điện thoại</span>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-teal-600 focus:ring-2"
          name="patientPhone"
          inputMode="tel"
          value={patientPhone}
          onChange={(e) => setPatientPhone(e.target.value)}
        />
        <span className="mt-1 block text-xs text-slate-500">Ví dụ: 0901234567</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-teal-700 px-4 py-2.5 font-medium text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {pending ? "Đang gửi…" : "Gửi yêu cầu đặt lịch"}
      </button>
    </form>
  );
}
