import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "Railway Station Simulator",
  description: "Next.js dashboard for RailSim",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {children}
      </body>
    </html>
  );
}


