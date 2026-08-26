"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createOrganizationWithBrandingAction } from "@/app/onboarding/actions";

const presets = [
  { name: "Midnight Violet", accent: "#7c3aed", background: "#f6f7fb", sidebar: "#111827" },
  { name: "Electric Blue", accent: "#2563eb", background: "#f4f8ff", sidebar: "#0f172a" },
  { name: "Performance Red", accent: "#dc2626", background: "#faf7f7", sidebar: "#18181b" },
  { name: "Forest", accent: "#059669", background: "#f3f8f6", sidebar: "#102c26" },
  { name: "Graphite", accent: "#111318", background: "#f6f7f9", sidebar: "#ffffff" },
];

function readableText(hex: string) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#111318" : "#ffffff";
}

export function OnboardingBrandingForm({ error }: { error: string | null }) {
  const [gymName, setGymName] = useState("Titan Fitness");
  const [accent, setAccent] = useState("#7c3aed");
  const [background, setBackground] = useState("#f6f7fb");
  const [sidebar, setSidebar] = useState("#111827");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  const avatarPreview = useMemo(() => (avatarFile ? URL.createObjectURL(avatarFile) : null), [avatarFile]);

  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const sidebarText = readableText(sidebar);
  const accentText = readableText(accent);

  return (
    <form action={createOrganizationWithBrandingAction} className="grid gap-6 xl:grid-cols-[1.08fr_.92fr]">
      <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)] backdrop-blur lg:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#111827] text-sm font-bold text-white">1</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a9099]">Workspace setup</p>
            <h1 className="text-2xl font-semibold tracking-tight text-[#111318]">Build your gym identity</h1>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#737983]">
          Set the operating defaults and visual identity your team will see every day. You can change all of this later in Settings.
        </p>

        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm font-medium text-[#252931]">
            Gym name
            <input
              name="name"
              required
              value={gymName}
              onChange={(event) => setGymName(event.target.value)}
              placeholder="Titan Fitness"
              className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] bg-white px-3 py-3 outline-none transition focus:border-[#7c3aed] focus:ring-4 focus:ring-[#7c3aed]/10"
            />
          </label>

          <label className="text-sm font-medium text-[#252931]">
            Main branch name
            <input name="location_name" required defaultValue="Main Branch" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3 outline-none focus:border-[#7c3aed]" />
          </label>

          <label className="text-sm font-medium text-[#252931]">
            Country
            <select name="country_code" defaultValue="LB" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3">
              <option value="LB">Lebanon</option>
              <option value="CY">Cyprus</option>
              <option value="AE">United Arab Emirates</option>
              <option value="SA">Saudi Arabia</option>
              <option value="GB">United Kingdom</option>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </label>

          <label className="text-sm font-medium text-[#252931]">
            Timezone
            <select name="timezone" defaultValue="Asia/Beirut" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3">
              <option>Asia/Beirut</option>
              <option>Asia/Nicosia</option>
              <option>Asia/Dubai</option>
              <option>Europe/London</option>
              <option>America/Toronto</option>
            </select>
          </label>

          <label className="text-sm font-medium text-[#252931]">
            Base currency
            <select name="base_currency" defaultValue="USD" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3">
              <option>USD</option>
              <option>EUR</option>
              <option>LBP</option>
              <option>AED</option>
              <option>SAR</option>
              <option>CAD</option>
              <option>GBP</option>
            </select>
          </label>
        </div>

        <div className="mt-8 border-t border-[#eceef2] pt-7">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#111827] text-sm font-bold text-white">2</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a9099]">Branding</p>
              <h2 className="text-lg font-semibold text-[#111318]">Choose your look</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-5">
            {presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  setAccent(preset.accent);
                  setBackground(preset.background);
                  setSidebar(preset.sidebar);
                }}
                className="rounded-xl border border-[#e3e5e9] bg-white p-2 text-left transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-8 overflow-hidden rounded-lg ring-1 ring-black/5">
                  <span className="flex-1" style={{ backgroundColor: preset.sidebar }} />
                  <span className="flex-1" style={{ backgroundColor: preset.background }} />
                  <span className="flex-1" style={{ backgroundColor: preset.accent }} />
                </div>
                <p className="mt-2 text-[11px] font-semibold leading-4 text-[#363b44]">{preset.name}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-[#252931]">
              Accent
              <input name="theme_accent" type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[#dfe2e7] bg-white p-1" />
            </label>
            <label className="text-sm font-medium text-[#252931]">
              Background
              <input name="theme_background" type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[#dfe2e7] bg-white p-1" />
            </label>
            <label className="text-sm font-medium text-[#252931]">
              Sidebar
              <input name="theme_sidebar" type="color" value={sidebar} onChange={(e) => setSidebar(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[#dfe2e7] bg-white p-1" />
            </label>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="rounded-xl border border-dashed border-[#ccd0d6] bg-[#fafbfc] p-4 text-sm font-medium text-[#252931]">
              Gym logo <span className="font-normal text-[#8a9099]">(optional)</span>
              <input
                name="logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                className="mt-2 block w-full text-xs"
              />
              <span className="mt-1 block text-[11px] font-normal text-[#8a9099]">JPG, PNG or WebP · max 2 MB</span>
            </label>

            <label className="rounded-xl border border-dashed border-[#ccd0d6] bg-[#fafbfc] p-4 text-sm font-medium text-[#252931]">
              Your profile photo <span className="font-normal text-[#8a9099]">(optional)</span>
              <input
                name="avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                className="mt-2 block w-full text-xs"
              />
              <span className="mt-1 block text-[11px] font-normal text-[#8a9099]">Used in your staff account menu</span>
            </label>
          </div>
        </div>

        <button
          className="mt-7 w-full rounded-xl px-5 py-3.5 text-sm font-bold shadow-[0_12px_32px_rgba(124,58,237,0.25)] transition hover:-translate-y-0.5"
          style={{ backgroundColor: accent, color: accentText }}
        >
          Create my gym workspace
        </button>
        <p className="mt-3 text-center text-xs text-[#8a9099]">Your 14-day trial starts when the workspace is created.</p>
      </section>

      <aside className="xl:sticky xl:top-8 xl:self-start">
        <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[#0b0f19] p-3 shadow-[0_35px_100px_rgba(15,23,42,0.28)]">
          <div className="mb-3 flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
            <span>Live workspace preview</span>
            <span>Updates instantly</span>
          </div>

          <div className="grid min-h-[560px] grid-cols-[132px_1fr] overflow-hidden rounded-[22px]" style={{ backgroundColor: background }}>
            <div className="p-3" style={{ backgroundColor: sidebar, color: sidebarText }}>
              <div className="flex items-center gap-2 border-b border-white/10 pb-4">
                {logoPreview ? (
                  <Image src={logoPreview} alt="Logo preview" width={34} height={34} unoptimized className="h-9 w-9 rounded-lg bg-white object-contain p-1" />
                ) : (
                  <div className="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold" style={{ backgroundColor: accent, color: accentText }}>
                    {(gymName || "G").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-bold">{gymName || "Your Gym"}</p>
                  <p className="text-[8px] opacity-55">Main Branch</p>
                </div>
              </div>

              <div className="mt-5 space-y-1.5 text-[9px]">
                {["Dashboard", "Members", "Access", "Memberships", "Payments", "Training"].map((item, index) => (
                  <div key={item} className="rounded-md px-2 py-2" style={index === 0 ? { backgroundColor: accent, color: accentText } : { opacity: 0.66 }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-medium text-[#8a9099]">{gymName || "Your Gym"} / Main Branch</p>
                  <p className="mt-1 text-sm font-bold text-[#171a21]">Dashboard</p>
                </div>
                {avatarPreview ? (
                  <Image src={avatarPreview} alt="Profile preview" width={34} height={34} unoptimized className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-[9px] font-bold text-[#252931] shadow-sm">YOU</div>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                {[
                  ["Active members", "684"],
                  ["Today's visits", "126"],
                  ["Renewals due", "18"],
                  ["Revenue MTD", "$31.4k"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                    <p className="text-[8px] text-[#8a9099]">{label}</p>
                    <p className="mt-1 text-base font-bold text-[#171a21]">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold text-[#252931]">Attendance pulse</p>
                  <span className="rounded-full px-2 py-1 text-[7px] font-semibold" style={{ backgroundColor: `${accent}18`, color: accent }}>Live</span>
                </div>
                <div className="mt-4 flex h-20 items-end gap-1.5">
                  {[28, 45, 34, 58, 72, 49, 82, 66, 91, 75, 62, 84].map((height, index) => (
                    <span key={index} className="flex-1 rounded-t-sm opacity-80" style={{ height: `${height}%`, backgroundColor: accent }} />
                  ))}
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <p className="text-[9px] font-bold text-[#252931]">Renewal intelligence</p>
                <div className="mt-3 space-y-2">
                  {["Maya H. · expires in 2 days", "Karim A. · at risk", "Rami S. · 12-day streak"].map((item, index) => (
                    <div key={item} className="flex items-center gap-2 text-[8px] text-[#656b75]">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: index === 2 ? "#10b981" : accent }} />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-xs leading-5 text-[#737983]">This is a visual preview. Your real dashboard populates from your gym data after setup.</p>
      </aside>
    </form>
  );
}
