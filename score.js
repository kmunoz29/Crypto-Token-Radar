/**
 * Quantitative Radar Scoring Engine
 * Outputs score (0-100), tier, and signal lines.
 */

function calculateRadarScore(data = {}) {
  const {
    creatorTotal = 1,
    creatorRecent = 1,
    devPercent = 0,
    top10Percent = 0,
    bundlerPercent = 0,
    sniperPercent = 0,
    insiderPercent = 0,
    smartTraderPercent = 0,
    holderCount = 0,
    holderStatus = data.holderStatus || data.status || "UNKNOWN",
    returnPercent = 0,
    isPriced = false
  } = data;

  let devScore = 20;
  let holderScore = 20;
  let smartMoneyScore = 5;
  let momentumScore = 10;
  const signals = [];

  // 1. Dev Velocity & History
  if (creatorRecent >= 3) {
    devScore -= 15;
    signals.push("🔴 Rapid-fire creator (serial deployer)");
  } else if (creatorTotal >= 3) {
    devScore += 3;
    signals.push("🟢 Experienced creator");
  } else {
    signals.push("🟡 New creator");
  }

  if (devPercent > 10) {
    devScore -= 15;
    signals.push("🔴 High dev supply holding");
  }

  devScore = Math.max(0, Math.min(25, devScore));

  // 2. Holder Clustering & Concentration
  if (holderStatus === "REJECT") {
    holderScore = 0;
    signals.push("🔴 Critical holder risk rejected");
  } else if (holderStatus === "WAIT" || holderStatus === "INDEXING") {
    holderScore = 12;
    signals.push("🟡 Holder data indexing");
  } else if (holderStatus === "PASS") {
    holderScore = 30;
    if (top10Percent > 65) {
      holderScore -= 15;
      signals.push("🟡 Heavy top 10 whale concentration");
    } else {
      signals.push("🟢 Distributed holder structure");
    }

    if (bundlerPercent >= 8 || insiderPercent >= 4) {
      holderScore -= 12;
      signals.push("🔴 High bundler or insider activity");
    }
  } else {
    signals.push("⚪ Holder analysis pending");
  }

  holderScore = Math.max(0, Math.min(35, holderScore));

  // 3. Smart Money Presence
  if (smartTraderPercent >= 5) {
    smartMoneyScore = 15;
    signals.push("🟢 Smart money detected buying");
  } else if (smartTraderPercent > 0) {
    smartMoneyScore = 10;
    signals.push("🟢 Minor smart trader activity");
  }

  // 4. Momentum & Price Discovery
  if (!isPriced && returnPercent === 0) {
    signals.push("⚪ Performance analysis pending");
  } else {
    if (returnPercent >= 20) {
      momentumScore = 25;
      signals.push(`🟢 High momentum (+${returnPercent.toFixed(1)}%)`);
    } else if (returnPercent >= 0) {
      momentumScore = 15;
      signals.push(`🟢 Positive return (+${returnPercent.toFixed(1)}%)`);
    } else if (returnPercent > -25) {
      momentumScore = 6;
      signals.push(`🟡 Minor drawdown (${returnPercent.toFixed(1)}%)`);
    } else {
      momentumScore = 0;
      signals.push(`🔴 Heavy selloff (${returnPercent.toFixed(1)}%)`);
    }
  }

  momentumScore = Math.max(0, Math.min(25, momentumScore));

  let totalScore = Math.max(
    0,
    Math.min(100, Math.round(devScore + holderScore + smartMoneyScore + momentumScore))
  );

  // Hard cap REJECTs so dangerous coins cannot score high
  if (holderStatus === "REJECT") {
    totalScore = Math.min(30, totalScore);
  }

  let tier = "NEUTRAL";
  if (totalScore >= 75) tier = "PRIME";
  else if (totalScore >= 55) tier = "SPECULATIVE";
  else if (totalScore < 35) tier = "AVOID";

  return {
    score: totalScore,
    tier,
    signals,
    breakdown: { devScore, holderScore, smartMoneyScore, momentumScore }
  };
}

module.exports = calculateRadarScore;