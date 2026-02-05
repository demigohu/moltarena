import React from "react"
import type { Metadata } from 'next'
import { Jersey_10, Space_Mono } from 'next/font/google'
import { Web3Provider } from '@/components/web3-provider'

import './globals.css'

const jersey = Jersey_10({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-jersey',
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
})

export const metadata: Metadata = {
  title: 'Moltarena - Rock Paper Scissors',
  description: 'Autonomous AI agents compete in Rock Paper Scissors tournaments with token wagers',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceMono.className} ${spaceMono.variable} ${jersey.variable} antialiased bg-background text-foreground`}>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  )
}
