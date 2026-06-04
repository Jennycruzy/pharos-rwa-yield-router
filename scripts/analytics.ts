import { Contract, formatUnits } from "ethers";
import { ERC20_ABI } from "./abi";
import { RESERVES } from "./config";
import { getUserPosition, rpcProvider } from "./reader";
import { RankedRow, rankReserves } from "./router";
import { assetPriceUsd, openFiPriceOracle } from "./prices";

export interface DragItem {
  kind: "idle" | "supplied";
  symbol: string;
  amount: number;
  currentApyPct: number;
  targetSymbol: string;
  targetApyPct: number;
  estimatedAnnualYieldLost: number;
  note: string;
}

export interface RiskItem {
  debtSymbol: string;
  debtAmount: number;
  debtValueUsd: number;
  healthFactor: number;
  collateralDropToLiquidationPct: number;
  note: string;
}

function human(raw: bigint, decimals: number): number {
  return Number(formatUnits(raw, decimals));
}

function findBetterReserve(current: RankedRow, rows: RankedRow[]): RankedRow | undefined {
  return rows
    .filter((r) => {
      if (!r.allocatable || r.reserve.symbol === current.reserve.symbol) return false;
      if (r.apyPct <= current.apyPct) return false;
      return (
        r.riskAdjustedScore >= current.riskAdjustedScore ||
        r.liquidationThresholdPct >= current.liquidationThresholdPct
      );
    })
    .sort((a, b) => b.apyPct - a.apyPct)[0];
}

export async function detectYieldDrag(user: string): Promise<DragItem[]> {
  const rows = await rankReserves();
  const bySymbol = new Map(rows.map((r) => [r.reserve.symbol, r]));
  const items: DragItem[] = [];

  for (const reserve of RESERVES) {
    const row = bySymbol.get(reserve.symbol);
    if (!row || row.error) continue;

    const token = new Contract(reserve.address, ERC20_ABI, rpcProvider());
    const [walletRaw, position] = await Promise.all([
      token.balanceOf(user) as Promise<bigint>,
      getUserPosition(reserve, user),
    ]);

    if (walletRaw > 0n && row.allocatable) {
      const amount = human(walletRaw, reserve.decimals);
      items.push({
        kind: "idle",
        symbol: reserve.symbol,
        amount,
        currentApyPct: 0,
        targetSymbol: reserve.symbol,
        targetApyPct: row.apyPct,
        estimatedAnnualYieldLost: (amount * row.apyPct) / 100,
        note: `${reserve.symbol} idle in wallet; OpenFi market is allocatable`,
      });
    }

    if (position.suppliedRaw > 0n) {
      const better = findBetterReserve(row, rows);
      if (better) {
        const amount = human(position.suppliedRaw, reserve.decimals);
        items.push({
          kind: "supplied",
          symbol: reserve.symbol,
          amount,
          currentApyPct: row.apyPct,
          targetSymbol: better.reserve.symbol,
          targetApyPct: better.apyPct,
          estimatedAnnualYieldLost: (amount * (better.apyPct - row.apyPct)) / 100,
          note: `${reserve.symbol} supplied while ${better.reserve.symbol} has higher APY with equal/better risk-adjusted profile`,
        });
      }
    }
  }

  return items.sort((a, b) => b.estimatedAnnualYieldLost - a.estimatedAnnualYieldLost);
}

export function renderYieldDrag(user: string, items: DragItem[]): string {
  const lines: string[] = [];
  lines.push(`yield drag for ${user}:`);
  if (items.length === 0) {
    lines.push("  no yield drag found across configured OpenFi reserves");
    return lines.join("\n");
  }

  for (const item of items) {
    lines.push(
      `  ${item.amount.toFixed(6)} ${item.symbol}: ${item.currentApyPct.toFixed(2)}% -> ` +
        `${item.targetApyPct.toFixed(2)}% ${item.targetSymbol}; ` +
        `est. lost/year ${item.estimatedAnnualYieldLost.toFixed(6)} ${item.symbol}`
    );
    lines.push(`    ${item.note}`);
  }
  return lines.join("\n");
}

export async function liquidationRisk(user: string): Promise<{ oracle: string; items: RiskItem[] }> {
  const [rows, oracle] = await Promise.all([rankReserves(), openFiPriceOracle()]);
  const bySymbol = new Map(rows.map((r) => [r.reserve.symbol, r]));
  let weightedCollateralUsd = 0;
  let totalDebtUsd = 0;
  const debts: Array<{ symbol: string; amount: number; valueUsd: number }> = [];

  for (const reserve of RESERVES) {
    const [position, price] = await Promise.all([
      getUserPosition(reserve, user),
      assetPriceUsd(reserve),
    ]);
    const row = bySymbol.get(reserve.symbol);
    const supplied = human(position.suppliedRaw, reserve.decimals);
    const debt = human(position.totalDebtRaw, reserve.decimals);

    if (position.usageAsCollateralEnabled && supplied > 0 && row) {
      weightedCollateralUsd += supplied * price.usd * (row.liquidationThresholdPct / 100);
    }
    if (debt > 0) {
      const valueUsd = debt * price.usd;
      totalDebtUsd += valueUsd;
      debts.push({ symbol: reserve.symbol, amount: debt, valueUsd });
    }
  }

  if (totalDebtUsd <= 0) return { oracle, items: [] };

  const healthFactor = weightedCollateralUsd / totalDebtUsd;
  const collateralDropToLiquidationPct =
    healthFactor <= 1 ? 0 : ((healthFactor - 1) / healthFactor) * 100;

  const items = debts
    .map((debt) => ({
      debtSymbol: debt.symbol,
      debtAmount: debt.amount,
      debtValueUsd: debt.valueUsd,
      healthFactor,
      collateralDropToLiquidationPct,
      note:
        healthFactor <= 1
          ? "position is at or below liquidation threshold"
          : `enabled collateral can fall ${collateralDropToLiquidationPct.toFixed(2)}% before aggregate HF reaches 1`,
    }))
    .sort((a, b) => a.collateralDropToLiquidationPct - b.collateralDropToLiquidationPct);

  return { oracle, items };
}

export function renderLiquidationRisk(
  user: string,
  result: { oracle: string; items: RiskItem[] }
): string {
  const lines: string[] = [];
  lines.push(`liquidation risk for ${user}:`);
  lines.push(`  price source: OpenFi oracle ${result.oracle} (8 decimals)`);
  if (result.items.length === 0) {
    lines.push("  no borrowed positions across configured OpenFi reserves");
    return lines.join("\n");
  }

  for (const item of result.items) {
    lines.push(
      `  ${item.debtAmount.toFixed(6)} ${item.debtSymbol} debt ` +
        `($${item.debtValueUsd.toFixed(2)}): HF ${item.healthFactor.toFixed(4)}, ` +
        `${item.collateralDropToLiquidationPct.toFixed(2)}% collateral drop buffer`
    );
    lines.push(`    ${item.note}`);
  }
  return lines.join("\n");
}
