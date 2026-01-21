import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { BenchmarkProvider } from "@/lib/context/BenchmarkContext";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "The Cerebras Advantage Calculator",
  description: "Real benchmarks. Live agent race. Immediate business impact.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} antialiased`}>
        <BenchmarkProvider>{children}</BenchmarkProvider>
      </body>
    </html>
  );
}
