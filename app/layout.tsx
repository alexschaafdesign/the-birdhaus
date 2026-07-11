import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import AdminBanner from "@/components/AdminBanner";
import { isAdminSession } from "@/lib/admin-session";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "the BIRDHAUS",
  description: "An intimate house venue in Minneapolis",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isAdmin = await isAdminSession();

  return (
    <html lang="en" style={{ backgroundColor: "#2A2420", color: "#E8E0D0" }}>
      <body className={instrumentSans.className} style={{ backgroundColor: "#2A2420", color: "#E8E0D0" }}>
        <AdminBanner isAdmin={isAdmin} />
        <Header />
        {children}
      </body>
    </html>
  );
}