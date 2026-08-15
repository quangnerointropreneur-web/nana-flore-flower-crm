import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const title = "Floré — Quản lý tiệm hoa";
  const description = "Quản lý đơn hàng, CRM, sản xuất, giao hoa, thanh toán và hóa đơn trên một nền tảng.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1732, height: 909, alt: "Floré — Quản lý tiệm hoa, thật nhẹ nhàng." }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
