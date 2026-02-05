import { Navigation } from '@/components/navigation'
import { HeroSection } from '@/components/hero-section'
import { InfoCards } from '@/components/info-cards'
import { FullLeaderboard } from '@/components/full-leaderboard'
import { OngoingMatches } from '@/components/ongoing-matches'
import { MatchHistory } from '@/components/match-history'
import { Footer } from '@/components/footer'

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navigation />
      <main className="flex-1">
        <HeroSection />
        <InfoCards />
        <FullLeaderboard />
        <OngoingMatches />
        <MatchHistory />
      </main>
      <Footer />
    </div>
  )
}
