# Mutual Trade Finder

A personal fantasy football tool that suggests trades that make **both** teams' starting lineups stronger, and shows how each team's positional ranks (QB, RB, WR, TE and overall) would change within the league.

This is a hobby project for my own redraft league. It runs locally on my own computer and is not a hosted service or a product for other users.

## How it works

1. **Player values.** Consensus player rankings are converted into values on an exponential curve, so elite players are worth more than several mid-tier players.
2. **Team score.** A team's score is the value of its best legal starting lineup for the league's slots (including flex), plus a small credit for bench depth.
3. **Search.** Every trade of 1 to 3 players per side with every opponent is scored for both teams. Only trades where **both** teams improve are kept. They're ranked by the Nash bargaining score (gain for me × gain for them), which favors balanced trades.
4. **Report.** Each suggested trade shows both teams' room ranks and overall rank, before and after.

The engine is plain TypeScript with no network access. It runs on a synthetic league in this repo:

```bash
npm install
npm test        # 65 tests
npm run demo    # top trades for a synthetic 12-team league
```

## Planned: Yahoo Fantasy Sports data (read-only)

The next step is to load my own league from the Yahoo Fantasy Sports API. Access would be:

- **Me only.** OAuth sign-in as myself, for a single league I belong to.
- **Read-only.** League settings (roster positions and roster size), every team's current roster, and basic player info (name, position, NFL team, injury status).
- **On demand.** A few requests a day at most, and never in bulk.
- **Kept local.** Data is stored only on my own computer. It is never published, shared or sold, and nothing is written back to Yahoo.

## License

Personal project, shared for reference. All rights reserved.
