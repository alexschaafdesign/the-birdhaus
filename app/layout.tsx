import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "the BIRDHAUS",
  description: "An intimate house venue in Minneapolis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ backgroundColor: "#2A2420", color: "#E8E0D0" }}>
      <body className={instrumentSans.className} style={{ backgroundColor: "#2A2420", color: "#E8E0D0" }}>
        <Header />
        {children}
      </body>
    </html>
  );
}