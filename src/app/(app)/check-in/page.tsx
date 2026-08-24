import { AppShell } from "@/components/app-shell";
import { CheckInTerminal } from "@/components/access/check-in-terminal";

export default function CheckInPage() {
  return (
    <AppShell active="Check-in">
      <section className="mx-auto max-w-7xl">
        <div className="mb-7">
          <p className="text-sm text-[#7a7f89]">Access & attendance</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Fast entry, accurate time tracking.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#717782]">One terminal handles membership-card swipes, RFID/NFC taps, QR/barcodes and manual lookup. Each visit becomes a check-in/check-out session so occupancy and time-in-gym reports stay accurate.</p>
        </div>
        <CheckInTerminal />
      </section>
    </AppShell>
  );
}
