import { Navigation } from '@/components/navigation'
import { MatchHistory } from '@/components/match-history'
import { Footer } from '@/components/footer'

export default function RecentMatchesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* <Navigation /> */}
      <main className="flex-1">
        <MatchHistory />
      </main>
      {/* <Footer /> */}
    </div>
  )
}
