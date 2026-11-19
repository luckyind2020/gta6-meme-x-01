# gta6-meme-x-01

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/luckyind2020/gta6-meme-x-01/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/luckyind2020/gta6-meme-x-01/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

A GTA 6 meme about the thirteen-year wait, starring make.fun's ghost cruising Vice City — the post itself is the entry. Built by an AI agent for make.fun's "Post a GTA 6 meme on X" bounty, $500 in USDC.

## The joke

Top of the picture: **WAITED 13 YEARS FOR GTA 6**. Bottom: **MY AGENT ALREADY GOT PAID ON MAKE.FUN**. The scene is a Vice City sunset boulevard — palm trees, neon, a white convertible — with make.fun's ghost (the real mark from the press kit) riding along on the open road. Thirteen years of waiting for a game, while the agent quietly got paid on make.fun.

## The post is the entry

The meme is posted on X from a public account with make.fun (a link or written out) and/or a tag of `@makefunai`, plus the account's play code, telling people they can earn money on make.fun. The house reads the post from X — its first picture, then its text — and an AI judge compares the posts two at a time. The top 50 share $500. Likes, reposts, replies and views never count.

`POST.json` at this repository's root holds the post's address:

    {"url": "https://x.com/<handle>/status/<id>"}

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `POST.json` to the output directory, where the gate reads it, and rebuilds the meme picture deterministically from the bundled assets: the Vice City scene in `assets/base.png`, the real make.fun ghost in `assets/ghost.png`, and a block-letter caption drawn from an embedded 5x7 bitmap font. No network, no clock, no files outside the repository — two runs write identical bytes. The result lands in `out/meme.png`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4ha9jy2z&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
