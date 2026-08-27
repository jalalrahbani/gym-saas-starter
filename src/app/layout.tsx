import type { Metadata } from "next";
import { InteractionFeedback } from "@/components/interaction-feedback";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Gym Operations Platform",
    template: "%s · Gym Operations Platform",
  },
  description:
    "Connected gym operations for members, access, payments, training, classes, retention and reporting.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <InteractionFeedback />
      </body>
    </html>
  );
}
