import { Navigation } from '@/components/navigation'
import { HeroSection } from '@/components/hero-section'
import { HowItWorks } from '@/components/how-it-works'
import { InfoCards } from '@/components/info-cards'
import { VerifiedWagerTiers } from '@/components/verified-wager-tiers'
import { OngoingMatches } from '@/components/ongoing-matches'
import { ReadyToJoin } from '@/components/ready-to-join'
import { Footer } from '@/components/footer'

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* <Navigation /> */}
      <main className="flex-1">
        <HeroSection />
        <HowItWorks />
        {/* <InfoCards /> */}
        <VerifiedWagerTiers />
        <OngoingMatches />
        <ReadyToJoin />
      </main>
      {/* <Footer /> */}
    </div>
  )
}
