import { OngoingMatches } from '@/components/ongoing-matches'
import React from 'react'

export default function LiveMatchesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
    {/* <Navigation /> */}
    <main className="flex-1">
      <OngoingMatches />
    </main>
    {/* <Footer /> */}
  </div>
  )
}
