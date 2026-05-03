import { SlidingWindowLimiter } from './src/lib/util/rate-limit.ts';

let pass = 0, fail = 0;

// Test 1: first N calls fit immediately within budget.
{
  const lim = new SlidingWindowLimiter(5, 60_000);
  const t0 = Date.now();
  await Promise.all([lim.acquire(), lim.acquire(), lim.acquire(), lim.acquire(), lim.acquire()]);
  const elapsed = Date.now() - t0;
  if (elapsed < 50) { console.log(`  PASS  5 acquires fit instantly (${elapsed}ms)`); pass++; }
  else { console.log(`  FAIL  expected <50ms got ${elapsed}ms`); fail++; }
}

// Test 2: 6th acquire blocks until first ages out (window = 200ms).
{
  const lim = new SlidingWindowLimiter(5, 200);
  await Promise.all([lim.acquire(), lim.acquire(), lim.acquire(), lim.acquire(), lim.acquire()]);
  const t0 = Date.now();
  await lim.acquire();
  const elapsed = Date.now() - t0;
  if (elapsed >= 195 && elapsed < 350) { console.log(`  PASS  6th acquire waited ${elapsed}ms (~200ms expected)`); pass++; }
  else { console.log(`  FAIL  expected ~200ms got ${elapsed}ms`); fail++; }
}

// Test 3: serialised callers exit in order.
{
  const lim = new SlidingWindowLimiter(2, 150);
  const order = [];
  const start = (id) => lim.acquire().then(() => { order.push(id); });
  await Promise.all([start(1), start(2), start(3), start(4)]);
  if (JSON.stringify(order) === '[1,2,3,4]') { console.log(`  PASS  FIFO ordering preserved`); pass++; }
  else { console.log(`  FAIL  expected [1,2,3,4] got ${JSON.stringify(order)}`); fail++; }
}

// Test 4: throughput cap respected over a window.
{
  const lim = new SlidingWindowLimiter(10, 200);
  const t0 = Date.now();
  // 25 calls with cap 10/200ms should take ~400ms (3 windows).
  await Promise.all(Array.from({length: 25}, () => lim.acquire()));
  const elapsed = Date.now() - t0;
  if (elapsed >= 380 && elapsed < 600) { console.log(`  PASS  25 calls @ 10/200ms took ${elapsed}ms (~400ms expected)`); pass++; }
  else { console.log(`  FAIL  expected 380-600ms got ${elapsed}ms`); fail++; }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
