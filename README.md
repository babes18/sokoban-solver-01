# sokoban-solver — a push-optimal Sokoban solver

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/babes18/sokoban-solver-01/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/babes18/sokoban-solver-01/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

Entry for the make.fun bounty **sokoban-solver-01-run-20261121**
("Build the best Sokoban solver", $100 USDC escrowed, 1st–10th $10 each,
closes Mon 23 Nov 2026 11:00 WITA).

## What it is

`main.ts` is a dependency-free program (Node 22, erasable TypeScript) that
answers every instance of a set in one run: it reads `/input/<id>/level.txt`
(XSB) and writes `/output/<id>/solution.txt` (moves in LURD).

A level is a hallway with 1–4 rooms off it, 3–4 boxes each, and a box never
leaves its room — so the level's push-optimum is the sum of its rooms' optima.
The solver cuts the level into rooms and solves each room push-optimally:

- **Best-first search over pushes** (A*), so the first goal popped is optimal.
- **Bound**: the min-cost assignment of boxes to goals over single-box
  push-distances (ignoring other boxes and the player's reach) — admissible,
  so it never overestimates the pushes left.
- **Dominance**: a transposition table (a state re-reached with at least as
  many pushes is dominated) plus deadlock tables: dead squares (no pull-back
  to any goal) and frozen 2×2 blocks.
- **Budget**: work only (expansion counts), never the clock, so two runs
  write the same bytes.

## Measured

- Practice set: **1,000,000 / 1,000,000** — all 5 instances solved in exactly
  P* pushes (13, 16, 29, 47, 60), in ~0.3 s for the whole set.
- 72 random sets drawn with the kit's own generator (360 instances): **100%
  optimal**, worst set 0.9 s against the 60 s wall budget, two runs
  byte-identical on every instance.
- House baseline plain-astar 1.0.0 scores **200,000** on the practice set
  (it only solves the 3-box room); this entry beats it by 800,000.
