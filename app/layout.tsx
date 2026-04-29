import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Remote Panel Testing Dashboard",
  description: "Control and monitor electrical test channels wirelessly via Communication Hub",
  themeColor: "#ffffff",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  )
}
