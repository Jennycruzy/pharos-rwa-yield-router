// ---------------------------------------------------------------------------
// Tulipa venue — an RWA-VAULT (kind:"rwa-vault"), and a CONFIRMED ALLOCATABLE
// deposit target. A Tulipa deposit is NOT a lending supply: it buys into a
// real-world-asset credit vault. See config.ts TULIPA for the on-chain proof
// (decoded deposit tx, ERC-4626 deposit method, term-locked redemption).
//
// What is wired:
//   - supply()    : the EXACT method the proven tx used —
//                   depositWithPermit(assets,receiver,deadline,v,r,s)
//                   (EIP-2612 USDC permit + ERC-4626 deposit in one tx).
//   - position()  : share balance + current USDC value (convertToAssets)
// What is intentionally NOT wired:
//   - withdraw()  : OMITTED — redemption is term-locked (redeem()/withdraw()
//                   revert with custom error 0xa339e0ec). Offering it would
//                   imply instant liquidity the vault does not currently grant.
// ---------------------------------------------------------------------------

import {
  Contract,
  JsonRpcProvider,
  Signature,
  TypedDataEncoder,
  Wallet,
  formatUnits,
  parseUnits,
} from "ethers";
import { CHAIN_ID, RPC_URL, Reserve, TULIPA } from "../config";
import { ERC20_ABI, ERC2612_ABI, ERC4626_ABI } from "../abi";
import { rpcProvider } from "../reader";
import { Venue, VReserveSnapshot, ExecResult, VPosition } from "./types";

const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

function wallet(): Wallet {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set");
  return new Wallet(pk, new JsonRpcProvider(RPC_URL));
}

const USDC_RESERVE: Reserve = { symbol: "USDC", address: TULIPA.asset, decimals: TULIPA.decimals };

export const tulipaVenue: Venue = {
  id: "tulipa",
  title: "Tulipa Multi-RWA Vault",
  kind: "rwa-vault",
  allocatable: true, // deposit confirmed on-chain

  reserves: () => [USDC_RESERVE],

  async snapshot(r: Reserve): Promise<VReserveSnapshot> {
    // No on-chain lending rate exists for an RWA credit vault; yield accrues via
    // NAV over time. We report the advertised APY honestly (off-chain) and the
    // term-lock so the row can never be mistaken for a verified lending rate.
    const base: VReserveSnapshot = {
      venueId: "tulipa",
      venueTitle: this.title,
      kind: "rwa-vault",
      symbol: r.symbol,
      baseApy: 0,
      apySource: "advertised",
      advertisedApy: TULIPA.advertisedApyPct,
      ltvPct: 0,
      liqThresholdPct: 0,
      allocatable: true,
      status: "allocatable (deposit) / redemption term-locked",
      note: `~${TULIPA.advertisedApyPct}% advertised (off-chain, not on-chain verified); deposit confirmed, redemption term-locked`,
    };
    try {
      const vault = new Contract(TULIPA.vault, ERC4626_ABI, rpcProvider());
      const maxDep: bigint = await vault.maxDeposit(
        "0x0000000000000000000000000000000000000001"
      );
      if (maxDep <= 0n) {
        return { ...base, allocatable: false, status: "deposit cap reached", note: `${base.note}; maxDeposit=0` };
      }
      return base;
    } catch (e: any) {
      return { ...base, allocatable: false, status: "read-error", error: e?.shortMessage ?? e?.message ?? String(e) };
    }
  },

  async supply(symbol: string, amountHuman: number): Promise<ExecResult> {
    if (symbol.toUpperCase() !== "USDC") {
      return { ok: false, reason: "Tulipa vault only accepts USDC deposits" };
    }
    const w = wallet();
    const amount = parseUnits(amountHuman.toString(), TULIPA.decimals);

    // Guard 1: deposits open (maxDeposit).
    const vaultRead = new Contract(TULIPA.vault, ERC4626_ABI, rpcProvider());
    const maxDep: bigint = await vaultRead.maxDeposit(w.address);
    if (maxDep < amount) {
      return { ok: false, reason: `exceeds Tulipa maxDeposit: cap ${maxDep}, need ${amount}` };
    }

    // Guard 2: USDC balance.
    const token = new Contract(TULIPA.asset, ERC2612_ABI, rpcProvider());
    const usdc = new Contract(TULIPA.asset, ERC20_ABI, rpcProvider());
    const bal: bigint = await usdc.balanceOf(w.address);
    if (bal < amount) {
      return { ok: false, reason: `insufficient USDC: have ${bal}, need ${amount}` };
    }

    // Build the EXACT call the proven tx used: an EIP-2612 USDC permit (owner =
    // wallet, spender = the vault, value = assets) bundled into the vault's
    // depositWithPermit — no separate approve tx. We self-check the EIP-712
    // domain against the token's DOMAIN_SEPARATOR so a wrong name/version fails
    // loudly instead of producing an invalid signature.
    const [nonce, name, version, onchainSeparator] = await Promise.all([
      token.nonces(w.address) as Promise<bigint>,
      token.name().catch(() => "USDC") as Promise<string>,
      token.version().catch(() => "1") as Promise<string>,
      token.DOMAIN_SEPARATOR().catch(() => null) as Promise<string | null>,
    ]);
    const domain = { name, version, chainId: CHAIN_ID, verifyingContract: TULIPA.asset };
    if (onchainSeparator && TypedDataEncoder.hashDomain(domain) !== onchainSeparator) {
      return {
        ok: false,
        reason: `EIP-2612 domain mismatch for ${name} v${version}; refusing to sign an invalid permit`,
      };
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const message = { owner: w.address, spender: TULIPA.vault, value: amount, nonce, deadline };
    const sig = Signature.from(await w.signTypedData(domain, PERMIT_TYPES, message));

    const vault = new Contract(TULIPA.vault, ERC4626_ABI, w);
    // Pre-flight the permit+deposit so an invalid signature or a deposit revert
    // is caught BEFORE spending gas on a doomed transaction.
    try {
      await vault.depositWithPermit.staticCall(amount, w.address, deadline, sig.v, sig.r, sig.s);
    } catch (e: any) {
      return { ok: false, reason: `Tulipa depositWithPermit preflight failed: ${e?.shortMessage ?? e?.message ?? e}` };
    }
    try {
      const tx = await vault.depositWithPermit(amount, w.address, deadline, sig.v, sig.r, sig.s);
      const r = await tx.wait();
      return { ok: true, txHash: r?.hash };
    } catch (e: any) {
      return { ok: false, reason: `Tulipa depositWithPermit reverted: ${e?.shortMessage ?? e?.message ?? e}` };
    }
  },

  // withdraw intentionally omitted — Tulipa redemption is term-locked.

  async position(user: string): Promise<VPosition[]> {
    const vault = new Contract(TULIPA.vault, ERC4626_ABI, rpcProvider());
    const shares: bigint = await vault.balanceOf(user);
    if (shares <= 0n) return [];
    let valueUsd: number | undefined;
    try {
      const assets: bigint = await vault.convertToAssets(shares);
      valueUsd = Number(formatUnits(assets, TULIPA.decimals));
    } catch {
      /* leave value undefined if NAV read reverts */
    }
    return [
      {
        venueId: "tulipa",
        venueTitle: this.title,
        kind: "rwa-vault",
        symbol: TULIPA.shareSymbol,
        amount: Number(formatUnits(shares, TULIPA.decimals)),
        valueUsd,
        note: "RWA-vault deposit; redemption term-locked (not instantly withdrawable)",
      },
    ];
  },
};
