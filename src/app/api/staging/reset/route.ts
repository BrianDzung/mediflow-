import { NextResponse } from "next/server";
import { authorizeStagingReset, resetDemoData } from "@/lib/staging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authorizeStagingReset({
    authorizationHeader: request.headers.get("authorization"),
    headerToken: request.headers.get("x-staging-reset-token"),
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
  }

  try {
    const inventory = await resetDemoData();
    return NextResponse.json({
      ok: true,
      message: "Demo data reset.",
      ...inventory,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, error: "Không thể reset dữ liệu demo.", code: "ERROR" },
      { status: 500 },
    );
  }
}
