import { pickSubject } from "@/lib/server/jev";

export async function POST(req: Request) {
  const { text } = (await req.json()) as { text: string };
  try {
    return Response.json({ subject: await pickSubject(text) });
  } catch (e) {
    console.error("subject failed", e);
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
