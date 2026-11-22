// Sokoban, push-optimal A* per room. A level is a hallway with 1-4 rooms off it;
// boxes never leave their room, so P* is the sum of the rooms' optima. Per room:
// best-first search over pushes, bound = g + min-assignment of single-box
// push-distances to goals (admissible, so the first goal popped is optimal),
// dominance = transposition table + dead-square and frozen-2x2 tables.
// Work-bounded only (never the clock), so two runs agree byte for byte.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const CAP = 250_000, RCAP = 2_500_000;
const D = [[0, -1, 'u', 'U'], [0, 1, 'd', 'D'], [-1, 0, 'l', 'L'], [1, 0, 'r', 'R']] as [number, number, string, string][];
let run = 0;
type L = { w: number; h: number; wall: Uint8Array; goals: number[]; boxes: number[]; player: number };
const P = (t: string): L => {
  const r = t.split('\n').filter((x) => x.length > 0), h = r.length, w = Math.max(...r.map((x) => x.length));
  const wall = new Uint8Array(w * h).fill(1), goals: number[] = [], boxes: number[] = [];
  let player = -1;
  r.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = row[x]!, i = y * w + x; if (c === '#') continue; wall[i] = 0; if ('.*+'.includes(c)) goals.push(i); if ('$*'.includes(c)) boxes.push(i); if ('@+'.includes(c)) player = i; } });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
  return { w, h, wall, goals, boxes: boxes.sort((a, b) => a - b), player };
};
const live = (v: L): Uint8Array => {
  const { w, wall, goals } = v, lv = new Uint8Array(wall.length), q = [...goals];
  for (const g of goals) lv[g] = 1;
  for (let i = 0; i < q.length; i++) { const x = q[i]!; for (const [dx, dy] of D) { const d = dy * w + dx, y = x - d; if (!wall[y] && !wall[y - d] && !lv[y]) { lv[y] = 1; q.push(y); } } }
  return lv;
};
const pd = (v: L, g: number): Int32Array => {
  const { w, wall } = v, dist = new Int32Array(wall.length).fill(-1), q = [g];
  dist[g] = 0;
  for (let i = 0; i < q.length; i++) { const p = q[i]!; for (const [dx, dy] of D) { const d = dy * w + dx, y = p - d; if (!wall[y] && !wall[y - d] && dist[y] < 0) { dist[y] = dist[p]! + 1; q.push(y); } } }
  return dist;
};
const reg = (v: L, occ: Uint8Array, from: number, seen: Int32Array, st: number, sk: Int32Array): number => {
  const { w, wall } = v;
  let low = from, n = 0;
  sk[n++] = from; seen[from] = st;
  while (n > 0) { const p = sk[--n]!; if (p < low) low = p; for (let k = 0; k < 4; k++) { const q = k === 0 ? p - w : k === 1 ? p + w : k === 2 ? p - 1 : p + 1; if (wall[q] === 0 && occ[q] === 0 && seen[q] !== st) { seen[q] = st; sk[n++] = q; } } }
  return low;
};
const frz = (v: L, occ: Uint8Array, goal: Uint8Array, t: number): boolean => {
  const { w, wall } = v;
  for (const a of [t, t - 1, t - w, t - w - 1]) { const b = a + 1, c = a + w, d = c + 1;
    if (!(wall[a] || occ[a]) || !(wall[b] || occ[b]) || !(wall[c] || occ[c]) || !(wall[d] || occ[d])) continue;
    if ((occ[a] && !goal[a]) || (occ[b] && !goal[b]) || (occ[c] && !goal[c]) || (occ[d] && !goal[d])) return true; }
  return false;
};
const walk = (v: L, occ: Uint8Array, from: number, to: number): string => {
  const { w, wall } = v;
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1), how = new Array<string>(wall.length), q = [from];
  prev[from] = from;
  for (let i = 0; i < q.length; i++) { const p = q[i]!; if (p === to) break; for (const [dx, dy, l] of D) { const s = p + dy * w + dx; if (wall[s] || occ[s] || prev[s] !== -1) continue; prev[s] = p; how[s] = l; q.push(s); } }
  if (prev[to] === -1) throw new Error('unreachable');
  let s = '';
  for (let p = to; p !== from; p = prev[p]!) s = how[p]! + s;
  return s;
};
const pk = (b: number[], sz: number): number => { let k = 0; for (let i = b.length - 1; i >= 0; i--) k = k * sz + b[i]!; return k; };
const unpk = (k: number, n: number, sz: number): number[] => { const o: number[] = []; for (let i = 0; i < n; i++) { o.push(k % sz); k = Math.floor(k / sz); } return o; };
const sroom = (v: L): { pushes: number; moves: string } | null => {
  const { w, wall, goals } = v, sz = wall.length, n = v.boxes.length, goal = new Uint8Array(sz);
  for (const g of goals) goal[g] = 1;
  const lv = live(v);
  if (v.boxes.some((b) => !lv[b])) return null;
  const dt = goals.map((g) => pd(v, g));
  const pm: number[][] = [];
  { const a = goals.map((_, i) => i); const gen = (k: number): void => { if (k === 1) { pm.push(a.slice()); return; } for (let i = 0; i < k; i++) { gen(k - 1); const j = k % 2 === 1 ? 0 : i; [a[j], a[k - 1]] = [a[k - 1]!, a[j]!]; } }; gen(a.length); }
  const h = (b: number[]): number => { let best = Infinity; for (const p of pm) { let s = 0; for (let i = 0; i < n; i++) { const d = dt[p[i]!]![b[i]!]!; if (d < 0) { s = Infinity; break; } s += d; } if (s < best) best = s; } return best; };
  const occ = new Uint8Array(sz), seen = new Int32Array(sz), mark = new Int32Array(sz), sk = new Int32Array(sz);
  let st = 0;
  const solved = (b: number[]): boolean => b.every((x) => goal[x]);
  const key = (p: number, l: number): number => l * 4294967296 + p;
  const heap: [number, number, number, number][] = [];
  const less = (a: [number, number, number, number], b: [number, number, number, number]): boolean => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
  const hp = (e: [number, number, number, number]): void => { let i = heap.length; heap.push(e); while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i]!, heap[p]!)) break; [heap[i], heap[p]] = [heap[p]!, heap[i]!]; i = p; } };
  const hq = (): [number, number, number, number] => { const t = heap[0]!, l = heap.pop()!; if (heap.length > 0) { heap[0] = l; for (let i = 0; ; ) { let c = 2 * i + 1; if (c >= heap.length) break; if (c + 1 < heap.length && less(heap[c + 1]!, heap[c]!)) c++; if (!less(heap[c]!, heap[i]!)) break; [heap[i], heap[c]] = [heap[c]!, heap[i]!]; i = c; } } return t; };
  const sb: number[] = [pk(v.boxes, sz)], sp: number[] = [v.player], sg: number[] = [0], pa: number[] = [-1], sf: number[] = [-1], st2: number[] = [-1], sl: number[] = [];
  const best = new Map<number, number>();
  for (const b of v.boxes) occ[b] = 1;
  const l0 = reg(v, occ, v.player, seen, ++st, sk);
  for (const b of v.boxes) occ[b] = 0;
  sl.push(l0);
  const h0 = h(v.boxes);
  if (h0 === Infinity) return null;
  best.set(key(sb[0]!, l0), 0);
  hp([h0, h0, 0, 0]);
  let seq = 1, exp = 0, found = solved(v.boxes) ? 0 : -1;
  while (heap.length > 0 && found < 0) {
    const [, , , s] = hq();
    const boxes = unpk(sb[s]!, n, sz), g = sg[s]!;
    if (best.get(key(sb[s]!, sl[s]!)) !== g) continue;
    if (solved(boxes)) { found = s; break; }
    if (run >= RCAP || exp >= CAP) return null;
    exp++; run++;
    for (const b of boxes) occ[b] = 1;
    const here = ++st;
    reg(v, occ, sp[s]!, seen, here, sk);
    for (let bi = 0; bi < n; bi++) {
      const b = boxes[bi]!;
      for (const [dx, dy] of D) {
        const d = dy * w + dx, t = b + d;
        if (seen[b - d] !== here || wall[t] || occ[t] || !lv[t]) continue;
        occ[b] = 0; occ[t] = 1;
        if (frz(v, occ, goal, t)) { occ[t] = 0; occ[b] = 1; continue; }
        const nx = boxes.slice();
        nx[bi] = t; nx.sort((a, b2) => a - b2);
        const low = reg(v, occ, b, mark, ++st, sk), packed = pk(nx, sz), nk = key(packed, low);
        occ[t] = 0; occ[b] = 1;
        const ng = g + 1, pb = best.get(nk);
        if (pb !== undefined && pb <= ng) continue;
        const nh = h(nx);
        if (nh === Infinity) continue;
        best.set(nk, ng);
        const t2 = sb.length;
        sb.push(packed); sp.push(b); sg.push(ng); pa.push(s); sf.push(b); st2.push(t); sl.push(low);
        hp([ng + nh, nh, seq++, t2]);
      }
    }
    for (const b of boxes) occ[b] = 0;
  }
  if (found < 0) return null;
  const path: number[] = [];
  for (let s = found; s > 0; s = pa[s]!) path.push(s);
  path.reverse();
  let moves = '', player = v.player, boxes = v.boxes;
  for (const s of path) {
    const from = sf[s]!, to = st2[s]!, d = to - from, dir = D.find(([dx, dy]) => dy * w + dx === d)!;
    for (const b of boxes) occ[b] = 1;
    moves += walk(v, occ, player, from - d);
    for (const b of boxes) occ[b] = 0;
    moves += dir[3]; player = from;
    const nb = boxes.slice();
    nb[nb.indexOf(from)] = to; nb.sort((a, b2) => a - b2); boxes = nb;
  }
  return { pushes: path.length, moves };
};
const rooms = (v: L): { boxes: number[]; goals: number[] }[] | null => {
  const { w, wall, goals, boxes, player } = v, lv = live(v), row = Math.floor(player / w), cut = new Uint8Array(wall.length);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !lv[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1), rs: { boxes: number[]; goals: number[] }[] = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const sq = [s];
    part[s] = rs.length;
    for (let i = 0; i < sq.length; i++) for (const [dx, dy] of D) { const q = sq[i]! + dy * w + dx; if (!wall[q] && !cut[q] && part[q] < 0) { part[q] = rs.length; sq.push(q); } }
    rs.push({ boxes: [], goals: [] });
  }
  for (const b of boxes) rs[part[b]!]!.boxes.push(b);
  for (const g of goals) if (part[g]! >= 0) rs[part[g]!]!.goals.push(g);
  if (goals.some((g) => part[g]! < 0) || rs.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rs.filter((r) => r.boxes.length > 0);
};
const slevel = (v: L): string => {
  const rs = rooms(v);
  if (rs === null) return '';
  let player = v.player, moves = '';
  const done = new Set<number>();
  for (let ri = 0; ri < rs.length; ri++) {
    const room = rs[ri]!, wall = v.wall.slice();
    for (let oj = 0; oj < rs.length; oj++) { if (oj === ri) continue; const o = rs[oj]!; for (const b of done.has(oj) ? o.goals : o.boxes) wall[b] = 1; }
    const sub: L = { w: v.w, h: v.h, wall, goals: room.goals.slice().sort((a, b) => a - b), boxes: room.boxes.slice().sort((a, b) => a - b), player };
    const s = sroom(sub);
    if (s === null) return '';
    moves += s.moves;
    for (const c of s.moves.toLowerCase()) player += c === 'u' ? -v.w : c === 'd' ? v.w : c === 'l' ? -1 : 1;
    done.add(ri);
  }
  return moves;
};
for (const id of readdirSync(I).sort()) {
  let moves = '';
  try { moves = slevel(P(readFileSync(join(I, id, 'level.txt'), 'utf8'))); } catch { moves = ''; }
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
