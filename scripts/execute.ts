// ---------------------------------------------------------------------------
// Execution — approve + supply into a chosen reserve, and withdraw back out.
// Mirrors the safety stance of the first skill: check balance, re-read the
// reserve to confirm it's still allocatable, and abort (don't force) on any
// problem.
// ---------------------------------------------------------------------------

import { Contract, JsonRpcProvider, Wallet, parseUnits, MaxUint256 } from "ethers";
import { RPC_URL, POOL, SAFETY, reserveBySymbol } from "./config";
import { OPENFI_ABI, ERC20_ABI } from "./abi";
import { snapshotReserve } from "./reader";

export interface ExecResult {
  ok: boolean;
  reason?: string;
  approveTx?: string;
  txHash?: string;
}

function wallet(): Wallet {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set");
  return new Wallet(pk, new JsonRpcProvider(RPC_URL));
}

export async function supply(symbol: string, amountHuman: number): Promise<ExecResult> {
  const reserve = reserveBySymbol(symbol);
  if (!reserve) return { ok: false, reason: `unknown reserve ${symbol}` };

  const w = wallet();
  const amount = parseUnits(amountHuman.toString(), reserve.decimals);

  // Guard 1: reserve still allocatable?
  const snap = await snapshotReserve(reserve);
  if (!snap.allocatable) {
    return { ok: false, reason: `${symbol} not allocatable (frozen/inactive/zero-rate)` };
  }

  // Guard 2: balance
  const token = new Contract(reserve.address, ERC20_ABI, w);
  const bal: bigint = await token.balanceOf(w.address);
  if (bal < amount) {
    return { ok: false, reason: `insufficient ${symbol}: have ${bal}, need ${amount}` };
  }

  // Approve the Pool to spend if needed.
  let approveTx: string | undefined;
  const allowance: bigint = await token.allowance(w.address, POOL);
  if (allowance < amount) {
    const tx = await token.approve(POOL, MaxUint256);
    const r = await tx.wait();
    approveTx = r?.hash;
  }

  // Supply.
  const pool = new Contract(POOL, OPENFI_ABI, w);
  try {
    const tx = await pool.supply(reserve.address, amount, w.address, SAFETY.REFERRAL_CODE);
    const r = await tx.wait();
    return { ok: true, approveTx, txHash: r?.hash };
  } catch (e: any) {
    return { ok: false, approveTx, reason: `supply reverted: ${e?.shortMessage ?? e?.message ?? e}` };
  }
}

export async function withdraw(symbol: string, amountHuman: number | "max"): Promise<ExecResult> {
  const reserve = reserveBySymbol(symbol);
  if (!reserve) return { ok: false, reason: `unknown reserve ${symbol}` };

  const w = wallet();
  const amount =
    amountHuman === "max" ? MaxUint256 : parseUnits(amountHuman.toString(), reserve.decimals);

  const pool = new Contract(POOL, OPENFI_ABI, w);
  try {
    const tx = await pool.withdraw(reserve.address, amount, w.address);
    const r = await tx.wait();
    return { ok: true, txHash: r?.hash };
  } catch (e: any) {
    return { ok: false, reason: `withdraw reverted: ${e?.shortMessage ?? e?.message ?? e}` };
  }
}
