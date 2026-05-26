// /api/upload — receive a file, push it to Supabase Storage, return the public URL.
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { getStorageClient, STORAGE_BUCKET } from "@/lib/storage";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const folder = (form.get("folder") as string | null) ?? "items";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported type ${file.type}` }, { status: 415 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${folder}/${randomUUID()}.${ext}`;

  try {
    const supabase = getStorageClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: pub.publicUrl, path });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
