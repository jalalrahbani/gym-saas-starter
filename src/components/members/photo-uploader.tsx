"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PhotoUploader({ organizationId, memberId }: { organizationId: string; memberId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("");
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { setStatus('Use JPEG, PNG or WebP.'); return; }
    if (file.size > 5 * 1024 * 1024) { setStatus('Photo must be 5 MB or smaller.'); return; }
    setStatus('Uploading…');
    const supabase = createClient();
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
    const path = `${organizationId}/members/${memberId}/photo-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('member-private').upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) { setStatus(uploadError.message); return; }
    const { error: updateError } = await supabase.from('members').update({ photo_path: path, updated_at: new Date().toISOString() }).eq('organization_id',organizationId).eq('id',memberId);
    if (updateError) { setStatus(updateError.message); return; }
    setStatus('Photo saved.');
    router.refresh();
  }
  return <label className="inline-flex cursor-pointer items-center rounded-lg border border-[#dfe2e7] px-3 py-2 text-xs font-semibold">Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} className="sr-only" /><span className="ml-2 font-normal text-[#7a7f89]">{status}</span></label>;
}
