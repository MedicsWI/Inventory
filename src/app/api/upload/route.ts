// /api/upload — receive a file, push it to Supabase Storage, return the public URL.
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { getStorageClient, STORAGE_BUCKET } from "@/lib/storage";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_FOLDERS = new Set(["items", "locations"]);
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

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
  // Allowlist the folder — never build storage keys from raw client input.
  const folderRaw = (form.get("folder") as string | null) ?? "items";
  const folder = ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : "items";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported type ${file.type}` }, { status: 415 });
  }

  // Extension from the validated MIME type, not the client filename.
  const ext = EXT_BY_TYPE[file.type] ?? "bin";
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
