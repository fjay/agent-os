import { NextRequest, NextResponse } from "next/server";
import { getDb, queries, type Session } from "@/lib/db";
import { statusDetector } from "@/lib/status-detector";
import { getProvider } from "@/lib/providers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { type } = body;

    if (type !== "input") {
      return NextResponse.json(
        { error: "Invalid activity type" },
        { status: 400 }
      );
    }

    const db = getDb();
    const session = queries.getSession(db).get(id) as Session | undefined;

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const provider = getProvider(session.agent_type || "claude");
    const tmuxSessionName = session.tmux_name || `${provider.id}-${id}`;

    await statusDetector.recordInput(
      tmuxSessionName,
      session.agent_type || "claude"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to record session activity:", error);
    return NextResponse.json(
      { error: "Failed to record session activity" },
      { status: 500 }
    );
  }
}
