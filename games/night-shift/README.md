# Rare Friend: Night Shift

## Project Name

Rare Friend: Night Shift

## Builder

[Your Name / contact]

## Category

Game / Survival / Decision Minigame

## One Sentence

“Rare Friend: Night Shift is a short survival decision game where players guide their selected Rare Friend through a strange night shift and try to make it safely to morning.”

## Rare Friends Use

The selected Rare Friend is the character the player protects and plays with during the night shift. The runtime provides a selected, verified hardwired Generations NFT and the game uses that identity as the Night Shift partner for the entire session.

## Stack

- Rare Friends FriendSDK v0.1.2
- TypeScript
- React
- CSS

## Setup

From the SDK repository root:

```bash
npm ci
npm run dev:game -- games/night-shift
```

Open the local URL shown in the terminal, typically http://localhost:4173, and connect a wallet in the SDK runtime.

## How to Play

1. Connect wallet and select an eligible Rare Friend.
2. Start the shift; the selected Friend is rendered with the SDK's canonical Generations sprites.
3. Explore the isometric security room with WASD, arrow keys, tap-to-walk, or the on-screen directional pad.
4. Move close to the highlighted desk, camera, entrance, phone, or storage station and press E or tap its prompt.
5. Choose one of the two incident responses. Each choice immediately changes Energy, Safety, and Suspicion and displays the Friend's report.
6. Resolve all eight incidents and make it to sunrise. Pause at any time for sound, reduced-motion, resume, or restart settings.

The player wins by completing all eight incidents without falling to zero Energy, zero Safety, or 100 Suspicion. The game ends in a shift report with a replay option.

## Wallet Requirements

This game relies on the SDK wallet and eligibility flow. The wallet must be connected to Robinhood mainnet (chain 4663) and the selected Friend must be a hardwired Generations NFT with generation 1 or higher. The SDK runtime verifies ownership before the game starts.

## Economy

The Vibeathon demo uses simulated interactions and simulated rewards. No real purchases, transfers, or real-money transactions are required to play the basic experience.

## Known Issues

- Wallet browser extension support is required for the full runtime flow.
- If no wallet is available, the SDK runtime shows the standard wallet connection and error states rather than a fake connection.
- A connected but ineligible Friend is rejected by the runtime and must be replaced with an owned hardwired Generations NFT.
