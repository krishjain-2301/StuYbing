import { NextResponse } from "next/server";
import { stopStudySession } from "@/actions/sessions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const roomCode = String(body.roomCode || "");
  if (!roomCode) {
    return NextResponse.json({ error: "Missing room code." }, { status: 400 });
  }
  const result = await stopStudySession(roomCode);
  return NextResponse.json(result);
}
