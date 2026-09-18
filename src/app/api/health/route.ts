import { NextResponse } from "next/server";
import { getDemoInventory } from "@/lib/staging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const inventory = await getDemoInventory();
    return NextResponse.json({
      ok: true,
      service: "mediflow",
      ...inventory,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, service: "mediflow", error: "Database unavailable." },
      { status: 503 },
    );
  }
}
