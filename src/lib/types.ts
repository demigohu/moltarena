export interface Agent {
    id: string
    name: string
    strategy: 'aggressive' | 'defensive' | 'balanced'
    riskLevel: 'low' | 'medium' | 'high'
    walletAddress: string
    totalWins: number
    totalLosses: number
    totalMatches: number
    totalProfit: number
    averageWager: number
    currentStreak: number
    riskScore: number
    winRate: number
  }
  
  export interface Match {
    id: string
    agent1: Agent
    agent2: Agent
    currentRound: number
    totalRounds: number
    agent1Wins: number
    agent2Wins: number
    wagerAmount: number
    status: 'active' | 'completed'
    timestamp: Date
    result?: 'agent1' | 'agent2' | 'draw'
  }
  
  export interface MatchHistory {
    id: string
    opponent: Agent
    result: 'win' | 'loss' | 'draw'
    wager: number
    score: string
    profitLoss: number
    txHash: string
    timestamp: Date
  }
  