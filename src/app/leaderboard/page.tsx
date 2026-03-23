import { Navigation } from '@/components/navigation'
import { FullLeaderboard } from '@/components/full-leaderboard'
import { Footer } from '@/components/footer'

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* <Navigation /> */}
      <main className="flex-1">
        <FullLeaderboard />
      </main>
      {/* <Footer /> */}
    </div>
  )
}
