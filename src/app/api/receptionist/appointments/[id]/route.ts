import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import {
  DecisionError,
  decisionHttpStatus,
  runReceptionistDecision,
} from "@/lib/receptionist";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await getSession();
    const { id } = await context.params;

    let body: { decision?: string; reason?: string } = {};
    try {
      body = (await request.json()) as { decision?: string; reason?: string };
    } catch {
      throw new DecisionError("VALIDATION", "Dữ liệu không hợp lệ.");
    }

    const result = await runReceptionistDecision(session, {
      appointmentId: id,
      decision: body.decision ?? "",
      reason: body.reason,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError || error instanceof DecisionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: decisionHttpStatus(error) },
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Không thể cập nhật lịch hẹn.", code: "ERROR" },
      { status: 500 },
    );
  }
}
