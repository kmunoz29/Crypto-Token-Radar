function calculateRadarScore(data) {

    let score = 50; // start neutral

    // Creator quality
    if (data.creatorLaunches <= 2) {
        score += 15;
    } else if (data.creatorLaunches >= 10) {
        score -= 20;
    }


    // Holder risk
    if (data.holderStatus === "PASS") {
        score += 20;
    }

    if (data.holderStatus === "REJECT") {
        score -= 30;
    }


    // Performance
    if (data.returnPercent > 20) {
        score += 15;
    }

    if (data.returnPercent < 0) {
        score -= 15;
    }


    // Keep score between 0-100
    score = Math.max(0, Math.min(100, score));


    return score;
}


module.exports = calculateRadarScore;